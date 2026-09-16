import type { ColumnType, Generated } from 'kysely';

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type TaskType = 'multiple_choice' | 'reading' | 'survey';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;

export interface AssessmentToolsTable {
  id: Generated<string>;
  title: string;
  grade: string;
  language: string | null;
  benchmark_value: string | null;
  benchmark_unit: string | null;
  draft_revision: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
  archived_at: NullableTimestamp;
}

export interface StepsTable {
  id: Generated<string>;
  tool_id: string;
  title: string;
  script: string | null;
  position: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TasksTable {
  id: Generated<string>;
  step_id: string;
  type: TaskType;
  prompt: string;
  position: number;
  passage: string | null;
  word_count: number | null;
  duration_seconds: number | null;
  stop_after_errors: number | null;
  options: string[] | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PublishedVersionsTable {
  id: Generated<string>;
  tool_id: string;
  version_number: number;
  language: string;
  sync_sequence: string;
  schema_version: number;
  snapshot: JsonValue;
  published_at: Timestamp;
}

export interface LanguageSyncStateTable {
  language: string;
  last_sequence: string;
}

export interface Database {
  assessment_tools: AssessmentToolsTable;
  steps: StepsTable;
  tasks: TasksTable;
  published_versions: PublishedVersionsTable;
  language_sync_state: LanguageSyncStateTable;
}
