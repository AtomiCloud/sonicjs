import { Hono } from 'hono'
import type { Bindings, Variables } from '../app'
import { requireAuth, AuthManager } from '../middleware/auth'
import { renderTenantsListPage } from '../templates/pages/admin-tenants-list.template'
import { renderAdminLayoutCatalyst } from '../templates/layouts/admin-layout-catalyst.template'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Require authentication on all routes
router.use('*', requireAuth())

// Require super_admin role
router.use('*', async (c, next) => {
  const user = c.get('user')
  if (user?.role !== 'super_admin') {
    if (c.req.header('Accept')?.includes('application/json') || c.req.path.includes('/api')) {
      return c.json({ error: 'Super admin access required' }, 403)
    }
    return c.redirect('/admin/dashboard')
  }
  return next()
})

// ============================================================================
// HTML Pages
// ============================================================================

// GET / — Tenants list page
router.get('/', async (c) => {
  try {
    const db = c.env.DB
    const user = c.get('user')!

    const result = await db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
        (SELECT COUNT(*) FROM content WHERE tenant_id = t.id) as content_count
      FROM tenants t
      ORDER BY t.created_at DESC
    `).all()

    return c.html(renderTenantsListPage({
      tenants: result.results as any[],
      user: { name: user.email, email: user.email, role: user.role },
      version: c.get('appVersion')
    }))
  } catch (error) {
    console.error('Error rendering tenants page:', error)
    return c.text('Failed to load tenants page', 500)
  }
})

// GET /:id — Tenant detail page
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  if (id === 'api') return // skip, handled by API routes below

  try {
    const db = c.env.DB
    const user = c.get('user')!

    const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first()
    if (!tenant) return c.redirect('/admin/tenants')

    const users = await db.prepare(
      'SELECT id, email, username, role, is_active, created_at FROM users WHERE tenant_id = ? ORDER BY created_at DESC'
    ).bind(id).all()

    const contentCount = await db.prepare(
      'SELECT COUNT(*) as count FROM content WHERE tenant_id = ?'
    ).bind(id).first() as any

    const tokens = await db.prepare(
      'SELECT id, name, created_at, last_used_at, expires_at FROM api_tokens WHERE tenant_id = ?'
    ).bind(id).all()

    const pageContent = renderTenantDetailPage(tenant as any, users.results as any[], contentCount?.count ?? 0, tokens.results as any[])

    return c.html(renderTenantsDetailLayout({
      title: `Tenant: ${(tenant as any).name}`,
      content: pageContent,
      user: { name: user.email, email: user.email, role: user.role },
      version: c.get('appVersion')
    }))
  } catch (error) {
    console.error('Error rendering tenant detail:', error)
    return c.text('Failed to load tenant detail', 500)
  }
})

// ============================================================================
// JSON API endpoints (under /api)
// ============================================================================

// POST /api — Create tenant + admin user + API token
router.post('/api', async (c) => {
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

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return c.json({ error: 'Slug must contain only lowercase letters, numbers, and hyphens' }, 400)
    }

    if (adminPassword.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400)
    }

    const existing = await db.prepare('SELECT id FROM tenants WHERE slug = ?').bind(slug).first()
    if (existing) {
      return c.json({ error: 'A tenant with this slug already exists' }, 409)
    }

    const now = Date.now()
    const tenantId = crypto.randomUUID()

    await db.prepare(
      'INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
    ).bind(tenantId, name, slug, now, now).run()

    const hashedPassword = await AuthManager.hashPassword(adminPassword)
    const userId = crypto.randomUUID()

    await db.prepare(
      'INSERT INTO users (id, email, username, first_name, last_name, password_hash, role, is_active, tenant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)'
    ).bind(userId, adminEmail, adminEmail.split('@')[0], 'Admin', 'User', hashedPassword, 'admin', tenantId, now, now).run()

    // Generate API token
    const tokenBytes = new Uint8Array(16)
    crypto.getRandomValues(tokenBytes)
    const tokenHex = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('')
    const apiToken = `ffx_${tokenHex}`
    const tokenId = crypto.randomUUID()

    await db.prepare(
      'INSERT INTO api_tokens (id, name, token, user_id, permissions, tenant_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(tokenId, `${slug}-api-token`, apiToken, userId, '["*"]', tenantId, now).run()

    const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').bind(tenantId).first()

    return c.json({ tenant, adminUser: { id: userId, email: adminEmail, role: 'admin' }, apiToken }, 201)
  } catch (error) {
    console.error('Error creating tenant:', error)
    return c.json({ error: 'Failed to create tenant' }, 500)
  }
})

// PUT /api/:id — Update tenant
router.put('/api/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    const body = await c.req.json<{ name?: string; slug?: string; is_active?: number; settings?: string }>()

    const existing = await db.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first()
    if (!existing) return c.json({ error: 'Tenant not found' }, 404)

    const updates: string[] = []
    const values: unknown[] = []

    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name) }
    if (body.slug !== undefined) {
      const slugCheck = await db.prepare('SELECT id FROM tenants WHERE slug = ? AND id != ?').bind(body.slug, id).first()
      if (slugCheck) return c.json({ error: 'Slug already in use' }, 409)
      updates.push('slug = ?'); values.push(body.slug)
    }
    if (body.is_active !== undefined) { updates.push('is_active = ?'); values.push(body.is_active) }
    if (body.settings !== undefined) { updates.push('settings = ?'); values.push(body.settings) }

    if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400)

    updates.push('updated_at = ?'); values.push(Date.now()); values.push(id)
    await db.prepare(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()

    const updated = await db.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first()
    return c.json(updated)
  } catch (error) {
    console.error('Error updating tenant:', error)
    return c.json({ error: 'Failed to update tenant' }, 500)
  }
})

// DELETE /api/:id — Soft-delete (deactivate)
router.delete('/api/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')

    const existing = await db.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first()
    if (!existing) return c.json({ error: 'Tenant not found' }, 404)

    await db.prepare('UPDATE tenants SET is_active = 0, updated_at = ? WHERE id = ?').bind(Date.now(), id).run()
    return c.json({ message: 'Tenant deactivated' })
  } catch (error) {
    console.error('Error deactivating tenant:', error)
    return c.json({ error: 'Failed to deactivate tenant' }, 500)
  }
})

// ============================================================================
// Helper: Tenant Detail Page Renderer
// ============================================================================

function renderTenantDetailPage(
  tenant: { id: string; name: string; slug: string; is_active: number; created_at: number },
  users: Array<{ id: string; email: string; username: string; role: string; is_active: number; created_at: number }>,
  contentCount: number,
  tokens: Array<{ id: string; name: string; created_at: number; last_used_at: number | null; expires_at: number | null }>
): string {
  const statusBadge = tenant.is_active
    ? '<span class="inline-flex items-center rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-400 ring-1 ring-inset ring-green-500/20">Active</span>'
    : '<span class="inline-flex items-center rounded-md bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 ring-1 ring-inset ring-red-500/20">Inactive</span>'

  const userRows = users.map(u => `
    <tr>
      <td class="whitespace-nowrap py-3 pl-4 pr-3 text-sm text-white sm:pl-6">${u.email}</td>
      <td class="whitespace-nowrap px-3 py-3 text-sm text-zinc-400">${u.role}</td>
      <td class="whitespace-nowrap px-3 py-3 text-sm">${u.is_active
        ? '<span class="text-green-400">Active</span>'
        : '<span class="text-red-400">Inactive</span>'}</td>
      <td class="whitespace-nowrap px-3 py-3 text-sm text-zinc-400">${new Date(u.created_at).toLocaleDateString()}</td>
    </tr>
  `).join('')

  const tokenRows = tokens.map(t => `
    <tr>
      <td class="whitespace-nowrap py-3 pl-4 pr-3 text-sm text-white sm:pl-6">${t.name}</td>
      <td class="whitespace-nowrap px-3 py-3 text-sm text-zinc-400">${new Date(t.created_at).toLocaleDateString()}</td>
      <td class="whitespace-nowrap px-3 py-3 text-sm text-zinc-400">${t.last_used_at ? new Date(t.last_used_at).toLocaleDateString() : 'Never'}</td>
    </tr>
  `).join('')

  return `
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="mb-6">
        <a href="/admin/tenants" class="text-sm text-zinc-400 hover:text-white transition-colors">&larr; Back to Tenants</a>
      </div>

      <div class="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 class="text-2xl font-semibold text-white">${tenant.name}</h1>
          <p class="mt-1 text-sm text-zinc-400">Slug: <code class="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">${tenant.slug}</code> ${statusBadge}</p>
        </div>
        <div class="mt-4 sm:mt-0 flex gap-3">
          <button onclick="toggleTenantStatus('${tenant.id}', ${tenant.is_active ? 0 : 1})"
            class="rounded-lg px-3.5 py-2.5 text-sm font-semibold ${tenant.is_active
              ? 'text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/10'
              : 'text-green-400 ring-1 ring-green-500/20 hover:bg-green-500/10'} transition-colors">
            ${tenant.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        <div class="rounded-xl bg-zinc-800/50 ring-1 ring-white/10 p-4">
          <p class="text-sm text-zinc-400">Users</p>
          <p class="text-2xl font-semibold text-white mt-1">${users.length}</p>
        </div>
        <div class="rounded-xl bg-zinc-800/50 ring-1 ring-white/10 p-4">
          <p class="text-sm text-zinc-400">Content Items</p>
          <p class="text-2xl font-semibold text-white mt-1">${contentCount}</p>
        </div>
        <div class="rounded-xl bg-zinc-800/50 ring-1 ring-white/10 p-4">
          <p class="text-sm text-zinc-400">API Tokens</p>
          <p class="text-2xl font-semibold text-white mt-1">${tokens.length}</p>
        </div>
      </div>

      <!-- Users -->
      <h2 class="text-lg font-semibold text-white mb-4">Users</h2>
      <div class="overflow-x-auto rounded-xl ring-1 ring-white/10 mb-8">
        <table class="min-w-full divide-y divide-white/5">
          <thead class="bg-zinc-800/50">
            <tr>
              <th class="py-3 pl-4 pr-3 text-left text-sm font-semibold text-zinc-300 sm:pl-6">Email</th>
              <th class="px-3 py-3 text-left text-sm font-semibold text-zinc-300">Role</th>
              <th class="px-3 py-3 text-left text-sm font-semibold text-zinc-300">Status</th>
              <th class="px-3 py-3 text-left text-sm font-semibold text-zinc-300">Created</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">${userRows || '<tr><td colspan="4" class="px-6 py-4 text-center text-sm text-zinc-500">No users</td></tr>'}</tbody>
        </table>
      </div>

      <!-- API Tokens -->
      <h2 class="text-lg font-semibold text-white mb-4">API Tokens</h2>
      <div class="overflow-x-auto rounded-xl ring-1 ring-white/10">
        <table class="min-w-full divide-y divide-white/5">
          <thead class="bg-zinc-800/50">
            <tr>
              <th class="py-3 pl-4 pr-3 text-left text-sm font-semibold text-zinc-300 sm:pl-6">Name</th>
              <th class="px-3 py-3 text-left text-sm font-semibold text-zinc-300">Created</th>
              <th class="px-3 py-3 text-left text-sm font-semibold text-zinc-300">Last Used</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">${tokenRows || '<tr><td colspan="3" class="px-6 py-4 text-center text-sm text-zinc-500">No tokens</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <script>
      async function toggleTenantStatus(id, newStatus) {
        if (!confirm(newStatus ? 'Activate this tenant?' : 'Deactivate this tenant?')) return;
        const res = await fetch('/admin/tenants/api/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: newStatus })
        });
        if (res.ok) window.location.reload();
        else alert('Failed to update tenant');
      }
    </script>
  `
}

function renderTenantsDetailLayout(data: {
  title: string; content: string;
  user: { name: string; email: string; role: string }; version?: string
}): string {
  return renderAdminLayoutCatalyst({
    title: data.title,
    currentPath: '/admin/tenants',
    user: data.user,
    version: data.version,
    content: data.content
  })
}

export default router
