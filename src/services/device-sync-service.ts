import type { Kysely } from 'kysely';

import type { Database } from '../db/types.js';
import type { DeviceSyncResponse, PublicationSnapshot } from '../domain/publication.js';
import { decodeSyncCursor, encodeSyncCursor } from '../domain/sync-cursor.js';
import { invalidSyncCursor, syncCursorAhead } from '../http/errors.js';
import { PublicationRepository } from '../repositories/publication-repository.js';

export interface DeviceSyncServicePort {
  sync(language: string, cursor?: string): Promise<DeviceSyncResponse>;
}

export class DeviceSyncService implements DeviceSyncServicePort {
  constructor(
    private readonly database: Kysely<Database>,
    private readonly publications = new PublicationRepository(),
  ) {}

  async sync(language: string, cursor?: string): Promise<DeviceSyncResponse> {
    const decoded = cursor ? decodeSyncCursor(cursor) : { language, sequence: '0' };
    if (!decoded) {
      throw invalidSyncCursor(
        'The cursor is malformed or was issued by an unsupported API version.',
      );
    }
    if (decoded.language !== language) {
      throw invalidSyncCursor(
        `This cursor belongs to language '${decoded.language}', not '${language}'.`,
      );
    }

    return this.database
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (transaction) => {
        const highWatermark = await this.publications.getHighWatermark(transaction, language);
        if (BigInt(decoded.sequence) > BigInt(highWatermark)) {
          throw syncCursorAhead();
        }

        const changes = await this.publications.findLatestChanges(
          transaction,
          language,
          decoded.sequence,
          highWatermark,
        );
        changes.sort((left, right) => compareSequence(left.sync_sequence, right.sync_sequence));

        return {
          cursor: encodeSyncCursor({ language, sequence: highWatermark }),
          tools: changes.map(
            (publication) => publication.snapshot as unknown as PublicationSnapshot,
          ),
        };
      });
  }
}

function compareSequence(left: string, right: string): number {
  const leftSequence = BigInt(left);
  const rightSequence = BigInt(right);
  if (leftSequence === rightSequence) return 0;
  return leftSequence < rightSequence ? -1 : 1;
}
