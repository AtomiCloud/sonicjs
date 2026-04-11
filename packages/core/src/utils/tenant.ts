import { HTTPException } from 'hono/http-exception'

/**
 * Get the current tenant ID from context. Throws 400 if not set.
 * Use in routes that require tenant context.
 */
export function getTenantId(c: { get(key: string): unknown }): string {
  const tenantId = c.get('tenantId') as string | undefined
  if (!tenantId) {
    throw new HTTPException(400, { message: 'No tenant context' })
  }
  return tenantId
}

/**
 * Get the current tenant ID from context, or null if not set.
 * Use in routes that optionally support tenant context (e.g. super-admin).
 */
export function getTenantIdOrNull(c: { get(key: string): unknown }): string | null {
  return (c.get('tenantId') as string | undefined) ?? null
}

/**
 * Check if the current user is a super-admin (cross-tenant).
 */
export function isSuperAdmin(c: { get(key: string): unknown }): boolean {
  const user = c.get('user') as { role?: string } | undefined
  return user?.role === 'super_admin'
}
