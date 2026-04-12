import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import type { Bindings, Variables } from '../app'

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>

/**
 * Tenant resolution middleware.
 * Runs after auth middleware. Sets tenantId on context for downstream handlers.
 *
 * Resolution order:
 * 1. Super-admin with X-Tenant-Id header → scope to that tenant
 * 2. JWT tenantId claim → browser users
 * 3. API token tenant_id → external API consumers (cms:push)
 * 4. No tenant → skip (public routes, bootstrap, super-admin without header)
 */
export function tenantMiddleware() {
  return async (c: AppContext, next: Next) => {
    const user = c.get('user')

    if (!user) {
      // Not authenticated — no tenant context (public routes)
      return next()
    }

    let tenantId: string | undefined

    // Super-admin can specify tenant via header or admin cookie
    if (user.role === 'super_admin') {
      // Priority: X-Tenant-Id header > admin_tenant_id cookie > no scoping
      const headerTenantId = c.req.header('X-Tenant-Id')
      const cookieTenantId = getCookie(c, 'admin_tenant_id')
      const selectedTenantId = headerTenantId || cookieTenantId
      if (selectedTenantId) {
        // Verify tenant exists
        const tenant = await c.env.DB
          .prepare('SELECT id FROM tenants WHERE id = ? AND is_active = 1')
          .bind(selectedTenantId)
          .first()
        if (!tenant) {
          return c.json({ error: 'Tenant not found' }, 404)
        }
        tenantId = selectedTenantId
      }
      // Super-admin without header or cookie: no tenant scoping (cross-tenant)
    } else {
      // Regular user: resolve from JWT claim
      tenantId = user.tenantId
    }

    if (tenantId) {
      c.set('tenantId', tenantId)
    }

    return next()
  }
}
