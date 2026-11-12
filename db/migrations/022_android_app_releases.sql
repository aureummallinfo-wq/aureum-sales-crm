CREATE TABLE IF NOT EXISTS crm.app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform = 'android'),
  version_name text NOT NULL CHECK (length(version_name) BETWEEN 1 AND 40),
  version_code integer NOT NULL CHECK (version_code > 0),
  minimum_version_code integer NOT NULL DEFAULT 1 CHECK (minimum_version_code > 0),
  file_name text NOT NULL,
  storage_key text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  release_notes text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  download_count integer NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  uploaded_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, platform, version_code),
  UNIQUE (workspace_id, storage_key)
);

CREATE INDEX IF NOT EXISTS app_releases_latest_idx
  ON crm.app_releases (workspace_id, platform, is_published, version_code DESC);
