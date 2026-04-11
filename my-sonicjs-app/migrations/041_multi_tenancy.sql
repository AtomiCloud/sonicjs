-- Multi-tenancy: row-level tenant isolation
-- Adds tenants table and tenant_id to all content-bearing tables

-- 1. Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  settings TEXT, -- JSON: plan, limits, custom config
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active);

-- 2. Add tenant_id to scoped tables (only tables created by file-based migrations)
ALTER TABLE users ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE collections ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE content ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE content_versions ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE media ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE api_tokens ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE workflow_history ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE forms ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE form_submissions ADD COLUMN tenant_id TEXT REFERENCES tenants(id);

-- Note: security_events, system_logs, form_files are created by plugin bootstrap (not file migrations).
-- They get tenant_id added via a separate bootstrap-time migration in the plugin code.

-- 3. Create default tenant and backfill all existing data
INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at)
VALUES ('default', 'Default', 'default', 1, strftime('%s','now')*1000, strftime('%s','now')*1000);

UPDATE users SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE collections SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE content SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE content_versions SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE media SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE api_tokens SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE workflow_history SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE forms SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE form_submissions SET tenant_id = 'default' WHERE tenant_id IS NULL;

-- 4. Tenant-scoped indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_collections_tenant ON collections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_content_tenant ON content(tenant_id);
CREATE INDEX IF NOT EXISTS idx_content_tenant_collection ON content(tenant_id, collection_id);
CREATE INDEX IF NOT EXISTS idx_content_tenant_slug ON content(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_content_versions_tenant ON content_versions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_media_tenant ON media(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_tenant ON api_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_history_tenant ON workflow_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_forms_tenant ON forms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_tenant ON form_submissions(tenant_id);

-- 5. Per-tenant unique constraints (replace global unique indexes)
DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_users_username;
DROP INDEX IF EXISTS idx_collections_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_username ON users(tenant_id, username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_tenant_name ON collections(tenant_id, name);
