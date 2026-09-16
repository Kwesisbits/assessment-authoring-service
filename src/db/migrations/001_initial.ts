import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE assessment_tools (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL CHECK (btrim(title) <> ''),
      grade text NOT NULL CHECK (btrim(grade) <> ''),
      language text,
      benchmark_value numeric(10, 2),
      benchmark_unit text,
      draft_revision integer NOT NULL DEFAULT 1 CHECK (draft_revision > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      archived_at timestamptz,
      CHECK (benchmark_value IS NULL OR benchmark_value > 0)
    );

    CREATE TABLE steps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tool_id uuid NOT NULL REFERENCES assessment_tools(id) ON DELETE CASCADE,
      title text NOT NULL CHECK (btrim(title) <> ''),
      script text,
      position integer NOT NULL CHECK (position > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT steps_tool_position_unique
        UNIQUE (tool_id, position) DEFERRABLE INITIALLY IMMEDIATE
    );

    CREATE TABLE tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      step_id uuid NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
      type text NOT NULL CHECK (type IN ('survey', 'reading', 'multiple_choice')),
      prompt text NOT NULL CHECK (btrim(prompt) <> ''),
      position integer NOT NULL CHECK (position > 0),
      passage text,
      word_count integer,
      duration_seconds integer,
      stop_after_errors integer,
      options text[],
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (word_count IS NULL OR word_count > 0),
      CHECK (duration_seconds IS NULL OR duration_seconds > 0),
      CHECK (stop_after_errors IS NULL OR stop_after_errors > 0),
      CONSTRAINT tasks_step_position_unique
        UNIQUE (step_id, position) DEFERRABLE INITIALLY IMMEDIATE
    );

    CREATE TABLE language_sync_state (
      language text PRIMARY KEY,
      last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence >= 0)
    );

    CREATE TABLE published_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tool_id uuid NOT NULL REFERENCES assessment_tools(id) ON DELETE RESTRICT,
      version_number integer NOT NULL CHECK (version_number > 0),
      language text NOT NULL CHECK (btrim(language) <> ''),
      sync_sequence bigint NOT NULL CHECK (sync_sequence > 0),
      schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
      snapshot jsonb NOT NULL,
      published_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT published_versions_tool_version_unique UNIQUE (tool_id, version_number),
      CONSTRAINT published_versions_language_sync_unique UNIQUE (language, sync_sequence)
    );

    CREATE INDEX published_versions_sync_idx
      ON published_versions (language, sync_sequence);

    CREATE OR REPLACE FUNCTION reject_published_version_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'published versions are immutable'
        USING ERRCODE = '55000';
    END;
    $$;

    CREATE TRIGGER published_versions_are_immutable
      BEFORE UPDATE OR DELETE ON published_versions
      FOR EACH ROW
      EXECUTE FUNCTION reject_published_version_mutation();
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS published_versions;
    DROP FUNCTION IF EXISTS reject_published_version_mutation();
    DROP TABLE IF EXISTS language_sync_state;
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS steps;
    DROP TABLE IF EXISTS assessment_tools;
  `.execute(db);
}
