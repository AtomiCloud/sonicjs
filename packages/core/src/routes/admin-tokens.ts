import { Hono } from 'hono'
import type { Bindings, Variables } from '../app'
import { requireAuth } from '../middleware/auth'
import { renderTokensListPage } from '../templates/pages/admin-tokens-list.template'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

router.use('*', requireAuth())

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

router.get('/', async (c) => {
  try {
    const db = c.env.DB
    const user = c.get('user')!

    const tokens = await db.prepare(`
      SELECT t.id, t.name, t.created_at, t.last_used_at, t.expires_at, u.email AS user_email
      FROM api_tokens t
      JOIN users u ON t.user_id = u.id
      WHERE t.tenant_id IS NULL
      ORDER BY t.created_at DESC
    `).all()

    return c.html(renderTokensListPage({
      tokens: tokens.results as any[],
      user: { name: user.email, email: user.email, role: user.role },
      version: c.get('appVersion')
    }))
  } catch (error) {
    console.error('Error rendering tokens page:', error)
    return c.text('Failed to load tokens page', 500)
  }
})

router.post('/api', async (c) => {
  try {
    const db = c.env.DB
    const user = c.get('user')!
    const body = await c.req.json<{ name?: string }>()

    const name = (body.name || '').trim()
    if (!name) return c.json({ error: 'name is required' }, 400)
    if (name.length > 100) return c.json({ error: 'name must be 100 characters or fewer' }, 400)

    const ownerRow = await db.prepare(
      'SELECT id FROM users WHERE id = ? AND role = ? AND is_active = 1'
    ).bind(user.userId, 'super_admin').first() as { id: string } | null

    if (!ownerRow) {
      return c.json({ error: 'Super admin user not found or inactive' }, 500)
    }

    const tokenBytes = new Uint8Array(16)
    crypto.getRandomValues(tokenBytes)
    const tokenHex = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('')
    const apiToken = `ffx_${tokenHex}`
    const tokenId = crypto.randomUUID()
    const now = Date.now()

    await db.prepare(
      'INSERT INTO api_tokens (id, name, token, user_id, permissions, tenant_id, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)'
    ).bind(tokenId, name, apiToken, ownerRow.id, '["*"]', now).run()

    return c.json({
      token: { id: tokenId, name, created_at: now },
      apiToken,
    }, 201)
  } catch (error) {
    console.error('Error minting super_admin token:', error)
    return c.json({ error: 'Failed to mint token' }, 500)
  }
})

router.delete('/api/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')

    const existing = await db.prepare(
      'SELECT id FROM api_tokens WHERE id = ? AND tenant_id IS NULL'
    ).bind(id).first()

    if (!existing) return c.json({ error: 'Token not found' }, 404)

    await db.prepare('DELETE FROM api_tokens WHERE id = ? AND tenant_id IS NULL').bind(id).run()
    return c.json({ message: 'Token revoked' })
  } catch (error) {
    console.error('Error revoking token:', error)
    return c.json({ error: 'Failed to revoke token' }, 500)
  }
})

export default router
