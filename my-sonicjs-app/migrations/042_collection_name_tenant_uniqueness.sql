-- Rebuild collections to remove legacy global UNIQUE(name)
-- and replace it with tenant-aware uniqueness.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS collections_rebuilt (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  schema TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  managed INTEGER DEFAULT 0 NOT NULL,
  source_type TEXT DEFAULT 'user',
  source_id TEXT,
  tenant_id TEXT REFERENCES tenants(id)
);

INSERT INTO collections_rebuilt (
  id,
  name,
  display_name,
  description,
  schema,
  is_active,
  created_at,
  updated_at,
  managed,
  source_type,
  source_id,
  tenant_id
)
SELECT
  id,
  name,
  display_name,
  description,
  schema,
  is_active,
  created_at,
  updated_at,
  COALESCE(managed, 0),
  COALESCE(source_type, 'user'),
  source_id,
  tenant_id
FROM collections;

DROP TABLE collections;
ALTER TABLE collections_rebuilt RENAME TO collections;

CREATE INDEX IF NOT EXISTS idx_collections_active ON collections(is_active);
CREATE INDEX IF NOT EXISTS idx_collections_tenant ON collections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_collections_source ON collections(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_collections_managed ON collections(managed);
CREATE INDEX IF NOT EXISTS idx_collections_managed_active ON collections(managed, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_tenant_name ON collections(tenant_id, name);

PRAGMA foreign_keys = ON;
