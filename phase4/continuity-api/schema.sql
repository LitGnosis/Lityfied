CREATE TABLE IF NOT EXISTS libraries (
 id UUID PRIMARY KEY,
 recovery_digest TEXT NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS projects (
 id UUID PRIMARY KEY,
 library_id UUID NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_library ON projects(library_id);
CREATE TABLE IF NOT EXISTS scenes (
 id UUID PRIMARY KEY,
 project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 sequence_id UUID NOT NULL,
 ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
 prompt TEXT NOT NULL,
 locks JSONB NOT NULL DEFAULT '{}'::jsonb,
 anchor_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (project_id, sequence_id, ordinal)
);
CREATE TABLE IF NOT EXISTS anchors (
 id UUID PRIMARY KEY,
 project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('character','location','style','frame')),
 label TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 sha256 TEXT NOT NULL,
 mime TEXT NOT NULL,
 bytes INTEGER NOT NULL CHECK(bytes BETWEEN 100 AND 10485760),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS anchors_project ON anchors(project_id);
CREATE TABLE IF NOT EXISTS render_jobs (
 id UUID PRIMARY KEY,
 project_id UUID NOT NULL REFERENCES projects(id),
 scene_id UUID NOT NULL REFERENCES scenes(id),
 library_id UUID NOT NULL REFERENCES libraries(id),
 day DATE NOT NULL,
 estimated_usd NUMERIC(12,6) NOT NULL CHECK(estimated_usd > 0),
 model TEXT NOT NULL,
 mode TEXT NOT NULL,
 request_digest TEXT NOT NULL,
 task_id TEXT,
 status TEXT NOT NULL,
 media_key TEXT,
 frame_key TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (library_id, request_digest)
);
CREATE INDEX IF NOT EXISTS render_jobs_daily ON render_jobs(day, library_id, project_id, status);
