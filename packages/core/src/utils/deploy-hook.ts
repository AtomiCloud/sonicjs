import type { D1Database } from '@cloudflare/workers-types'

/**
 * Fire the tenant's deploy hook URL if configured.
 * Fire-and-forget — don't block the response.
 */
export async function fireDeployHook(db: D1Database, tenantId: string): Promise<void> {
  try {
    const tenant = await db.prepare('SELECT settings FROM tenants WHERE id = ?').bind(tenantId).first()
    if (!tenant?.settings) return
    const settings = JSON.parse(tenant.settings as string)
    if (!settings.deploy_hook_url) return
    // Fire and forget
    fetch(settings.deploy_hook_url, { method: 'POST' }).catch(() => {})
  } catch {
    // Don't fail the request if hook fails
  }
}
