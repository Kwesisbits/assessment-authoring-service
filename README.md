# Assessment Authoring Service

An HTTP API for authoring ordered assessment content, validating drafts, publishing
immutable versions, and synchronizing published tools to intermittently connected
devices.

The service models an assessment as:

```text
Assessment tool
└── ordered steps
    └── ordered tasks (survey, reading, or multiple choice)
```

Drafts may be incomplete while authors work. Publishing validates the complete
aggregate and stores a permanent snapshot. The device API reads only those snapshots;
it never reads draft tables.

## Stack

- Node.js 22 and strict TypeScript
- Fastify for HTTP routing and lifecycle
- PostgreSQL for persistence and transaction-level consistency
- Kysely for typed SQL, migrations, and explicit transaction control
- Zod for request and environment validation
- Vitest for unit and PostgreSQL integration tests

## Prerequisites

- Node.js 22 or newer
- PostgreSQL 14 or newer
- PostgreSQL command-line tools (`createdb`) or equivalent access through pgAdmin

## Setup

Setup takes no more than five commands on a clean machine:

```bash
npm ci
cp .env.example .env
createdb -U postgres assessment_authoring
createdb -U postgres assessment_authoring_test
npm run db:setup
```

On PowerShell, use `Copy-Item .env.example .env` for the second command. If the
databases already exist, skip the corresponding `createdb` commands.

After copying `.env`, replace the example credentials with the local PostgreSQL
credentials before running `db:setup`:

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/assessment_authoring
TEST_DATABASE_URL=postgresql://postgres:your_password@localhost:5432/assessment_authoring_test
PORT=3000
LOG_LEVEL=info
```

Passwords containing URL-reserved characters must be percent-encoded. `.env` is
ignored by Git and must never be committed. The test and development URLs must point
to different databases because integration tests reset the test database.

Start the service:

```bash
npm run dev
```

It listens on `http://localhost:3000`; `GET /health` returns its health status.

## Useful commands

- `npm run db:migrate` — apply pending migrations
- `npm run db:seed` — reset the two deterministic seed drafts
- `npm run db:setup` — migrate and seed the development database
- `npm test` — run unit and real-PostgreSQL integration tests
- `npm run test:unit` — run unit tests only
- `npm run test:integration` — run integration tests only
- `npm run typecheck` — check TypeScript without emitting files
- `npm run lint` — run ESLint
- `npm run build` / `npm start` — build and run compiled JavaScript

## Seed data

`npm run db:seed` creates:

- A complete Grade 3 Oral Reading Fluency tool in isiZulu with three steps, a
  130-word passage, a 60-second duration, and a five-error stop rule.
- A deliberately broken tool with no language or benchmark, an empty step, an
  incomplete reading task, and duplicate multiple-choice options.

The stable tool IDs are printed after seeding, making both cases immediately usable
for manual validation.

## API overview

All request bodies are JSON. Successful reads and mutations use camel-case response
fields.

Tool authoring:

- `POST /tools`
- `GET /tools`
- `GET /tools/:toolId`
- `PATCH /tools/:toolId`
- `DELETE /tools/:toolId`

Ordered content:

- `POST /tools/:toolId/steps`
- `GET`, `PATCH`, `DELETE /steps/:stepId`
- `POST /steps/:stepId/move`
- `POST /steps/:stepId/tasks`
- `GET`, `PATCH`, `DELETE /tasks/:taskId`
- `POST /tasks/:taskId/move`

Publishing and device delivery:

- `POST /tools/:toolId/publications`
- `GET /tools/:toolId/publications`
- `GET /publications/:publicationId`
- `GET /device/tools?language=isiZulu&cursor=...`

### Draft concurrency

Draft reads and successful mutations return an `ETag` containing the aggregate
revision. Every mutation of an existing tool, including adding or moving children,
must return that value in `If-Match`:

```http
PATCH /tools/c25a4059-23af-4f89-8b5f-79e731ddc65e
If-Match: "3"
Content-Type: application/json

{ "title": "Updated title" }
```

A stale revision receives `409 draft_revision_conflict` with the current revision.
A missing precondition receives `428 draft_revision_required`.

Move operations accept only a target position (and destination step for a task).
Clients do not resend all siblings:

```json
{
  "stepId": "469972a7-32ca-480a-953b-1e218300bcb1",
  "position": 2
}
```

### Publication validation

`POST /tools/:toolId/publications` validates the locked draft and returns every
violation in one `422 publication_validation_failed` response. Each violation has a
stable code, an actionable path and message, and, where relevant, an entity ID.

Validation requires:

- A language and positive benchmark with a unit
- At least one step and at least one task in every step
- Contiguous, unique positions beginning at 1
- Passage, positive word count, and positive duration for reading tasks
- At least two distinct, nonblank options for multiple-choice tasks

No publication row is written if any rule fails.

### Device synchronization

The device endpoint accepts a language and an optional opaque cursor. An omitted
cursor starts at the beginning of that language's publication stream. The response
contains the newest changed publication for each tool and a new cursor:

```json
{
  "cursor": "opaque-value",
  "tools": []
}
```

Each item in `tools` is a complete immutable assessment. A device should apply the
whole response and persist the returned cursor only after applying the tools. Reusing
the previous cursor is safe if connectivity is lost.

## Walkthrough

[`examples/walkthrough.http`](examples/walkthrough.http) is an executable walkthrough
for REST Client-compatible editors. In order, it:

1. Creates an incomplete tool, step, and reading task.
2. Demonstrates a publish failure containing all violations.
3. Fixes the tool and task.
4. Publishes the valid draft.
5. Fetches it through the device endpoint and reuses the returned cursor.

Run `npm run dev`, then execute the requests from top to bottom.

## Architecture

```text
src/
├── domain/        domain types, publication validation, snapshots, cursors
├── http/          request schemas, preconditions, Problem Details errors
├── routes/        Fastify transport adapters
├── services/      transactions and application rules
├── repositories/  typed PostgreSQL queries and ordering operations
├── mappers/       database rows to API/domain representations
└── db/            schema migration, seed data, and connection setup

test/
├── unit/          pure rules and HTTP contract tests
└── integration/   complete workflows against isolated PostgreSQL
```

All aggregate writes lock the parent tool row. This gives authoring, ordering, and
publishing one consistent transaction boundary. PostgreSQL constraints protect
positive and unique sibling positions; application logic additionally maintains and
validates contiguity.

## Design decisions

### Published versions: whole-tree JSON snapshots

Publishing copies the validated tool, steps, and type-specific tasks into one
schema-versioned JSONB snapshot. The draft remains normalized for focused edits, while
a historical read is one immutable row and directly answers “what did this tool look
like then?” A database trigger rejects updates and deletes to publication rows.

The cost is write amplification and storage proportional to the full tool on every
publication. Querying individual fields across all historical tasks is also less
convenient than a fully normalized versioned model. For this read-heavy, whole-tool
delivery path, simple and reliable historical reads are worth that cost.

### Ordering: contiguous integers with optimistic concurrency

Steps and tasks use contiguous 1-based integer positions. Inserts, deletes, and moves
shift only the affected range inside a transaction; deferrable uniqueness constraints
allow temporary collisions while the range is changing. This is O(n) in the affected
range, but is straightforward to validate and appropriate for the expected small
assessment trees.

Every draft mutation locks the parent tool and compares `If-Match` with its revision.
If two authors reorder revision 5 concurrently, one transaction commits revision 6
and the other receives a 409 instead of silently overwriting it. This deliberately
detects the conflict without attempting distributed collaborative editing.

### Device marker: opaque per-language cursor

The cursor wraps a versioned, per-language bigint publication sequence. Sequence
allocation is serialized in the same transaction as publication, so it follows commit
visibility and avoids timestamp ties, clock skew, and transaction-order races. Sync
uses a repeatable-read high-water mark and returns only whole snapshots through that
point.

The accepted trade-off is that cursors belong to this server history and one language;
clients cannot interpret or transfer them. The endpoint is intentionally unpaginated
because the brief requires one response, so a very large accumulated delta would
increase response size and memory use.

## Assumptions

- Incomplete task-type fields are allowed in drafts and enforced at publication.
- A tool's language may be set while drafting but cannot change after its first
  publication; another language is a separate tool.
- Deleting a tool archives its authoring record. Existing publications remain
  immutable and available to devices.
- Option uniqueness is case-sensitive after trimming surrounding whitespace.
- Device clients atomically apply whole tools before saving the response cursor.

## What was cut, what comes next, and known limitations

Authentication, users, permissions, UI, deployment, containers, CI, collaboration,
and API localization were intentionally excluded as directed.

The optional audit trail was deferred until the five required areas were complete and
manually reviewed. It is the first extension I would add, recording actor, action,
entity, timestamp, and concise before/after details in the same transaction as each
write. A curriculum-facing diff between publication snapshots would be the next
product-focused improvement.

The main known scaling compromises are O(n) positional range updates and an
unpaginated device delta. Both keep correctness visible and implementation focused for
the assignment's small trees and one-response sync requirement. At larger scale I
would measure actual contention and payload sizes before adopting fractional ordering
or a paginated, resumable synchronization protocol.
