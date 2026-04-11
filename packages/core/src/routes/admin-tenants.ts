import { Hono } from 'hono'
import type { Bindings, Variables } from '../app'
import { requireAuth, AuthManager } from '../middleware/auth'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Require authentication on all routes
router.use('*', requireAuth())

// Require super_admin role
router.use('*', async (c, next) => {
  const user = c.get('user')
  if (user?.role !== 'super_admin') {
    return c.json({ error: 'Super admin access required' }, 403)
  }
  return next()
})

// GET /api/tenants — List all tenants
router.get('/', async (c) => {
  try {
    const db = c.env.DB
    const result = await db.prepare('SELECT * FROM tenants ORDER BY created_at DESC').all()
    return c.json(result.results)
  } catch (error) {
    console.error('Error listing tenants:', error)
    return c.json({ error: 'Failed to list tenants' }, 500)
  }
})

// POST /api/tenants — Create tenant + admin user + API token
router.post('/', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json<{
      name: string
      slug: string
      adminEmail: string
      adminPassword: string
    }>()

    const { name, slug, adminEmail, adminPassword } = body

    if (!name || !slug || !adminEmail || !adminPassword) {
      return c.json({ error: 'name, slug, adminEmail, and adminPassword are required' }, 400)
    }

    // Validate slug uniqueness
    const existing = await db
      .prepare('SELECT id FROM tenants WHERE slug = ?')
      .bind(slug)
      .first()

    if (existing) {
      return c.json({ error: 'A tenant with this slug already exists' }, 409)
    }

    const now = new Date().toISOString()
    const tenantId = crypto.randomUUID()

    // Insert tenant record
    await db
      .prepare(
        'INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
      )
      .bind(tenantId, name, slug, now, now)
      .run()

    // Hash password and create admin user
    const hashedPassword = await AuthManager.hashPassword(adminPassword)
    const userId = crypto.randomUUID()

    await db
      .prepare(
        'INSERT INTO users (id, email, password, role, tenant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(userId, adminEmail, hashedPassword, 'admin', tenantId, now, now)
      .run()

    // Generate API token: ffx_ + 32 random hex chars
    const tokenBytes = new Uint8Array(16)
    crypto.getRandomValues(tokenBytes)
    const tokenHex = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const apiToken = `ffx_${tokenHex}`
    const tokenId = crypto.randomUUID()

    await db
      .prepare(
        'INSERT INTO api_tokens (id, token, tenant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(tokenId, apiToken, tenantId, now, now)
      .run()

    // Fetch the created tenant
    const tenant = await db
      .prepare('SELECT * FROM tenants WHERE id = ?')
      .bind(tenantId)
      .first()

    const adminUser = await db
      .prepare('SELECT id, email, role, tenant_id, created_at, updated_at FROM users WHERE id = ?')
      .bind(userId)
      .first()

    return c.json({ tenant, adminUser, apiToken }, 201)
  } catch (error) {
    console.error('Error creating tenant:', error)
    return c.json({ error: 'Failed to create tenant' }, 500)
  }
})

// GET /api/tenants/:id — Get single tenant
router.get('/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first()

    if (!tenant) {
      return c.json({ error: 'Tenant not found' }, 404)
    }

    return c.json(tenant)
  } catch (error) {
    console.error('Error fetching tenant:', error)
    return c.json({ error: 'Failed to fetch tenant' }, 500)
  }
})

// PUT /api/tenants/:id — Update tenant
router.put('/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    const body = await c.req.json<{
      name?: string
      slug?: string
      is_active?: number
      settings?: string
    }>()

    // Check tenant exists
    const existing = await db.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first()
    if (!existing) {
      return c.json({ error: 'Tenant not found' }, 404)
    }

    const updates: string[] = []
    const values: unknown[] = []

    if (body.name !== undefined) {
      updates.push('name = ?')
      values.push(body.name)
    }
    if (body.slug !== undefined) {
      // Validate slug uniqueness if changing
      const slugCheck = await db
        .prepare('SELECT id FROM tenants WHERE slug = ? AND id != ?')
        .bind(body.slug, id)
        .first()
      if (slugCheck) {
        return c.json({ error: 'A tenant with this slug already exists' }, 409)
      }
      updates.push('slug = ?')
      values.push(body.slug)
    }
    if (body.is_active !== undefined) {
      updates.push('is_active = ?')
      values.push(body.is_active)
    }
    if (body.settings !== undefined) {
      updates.push('settings = ?')
      values.push(body.settings)
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }

    const now = new Date().toISOString()
    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)

    await db
      .prepare(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run()

    const updated = await db.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first()
    return c.json(updated)
  } catch (error) {
    console.error('Error updating tenant:', error)
    return c.json({ error: 'Failed to update tenant' }, 500)
  }
})

// DELETE /api/tenants/:id — Soft-delete (deactivate)
router.delete('/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    const now = new Date().toISOString()

    const existing = await db.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first()
    if (!existing) {
      return c.json({ error: 'Tenant not found' }, 404)
    }

    await db
      .prepare('UPDATE tenants SET is_active = 0, updated_at = ? WHERE id = ?')
      .bind(now, id)
      .run()

    return c.json({ message: 'Tenant deactivated successfully' })
  } catch (error) {
    console.error('Error deactivating tenant:', error)
    return c.json({ error: 'Failed to deactivate tenant' }, 500)
  }
})

export default router
