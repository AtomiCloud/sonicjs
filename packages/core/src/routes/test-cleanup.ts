/**
 * Test Cleanup Routes
 *
 * Provides endpoints to clean up test data after e2e tests
 * WARNING: These endpoints should only be available in development/test environments
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { getTenantIdOrNull } from '../utils/tenant'

const app = new Hono()

/**
 * Clean up all test data (collections, content, users except admin)
 * POST /test-cleanup
 */
app.post('/test-cleanup', async (c: Context) => {
  const db = c.env.DB as D1Database

  // Only allow in development/test environments
  if (c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'Cleanup endpoint not available in production' }, 403)
  }

  try {
    let deletedCount = 0
    const tenantId = getTenantIdOrNull(c)
    const tenantFilter = tenantId ? ' AND tenant_id = ?' : ''

    // Use pattern-based deletes to avoid SQL variable limits
    // This approach uses subqueries instead of building large IN lists
    // When tenantId is set, scope deletions to that tenant only

    // Step 1: Delete child data for test content (by pattern)
    const cv1Query = db.prepare(`
      DELETE FROM content_versions
      WHERE content_id IN (
        SELECT id FROM content
        WHERE (title LIKE 'Test %' OR title LIKE '%E2E%' OR title LIKE '%Playwright%' OR title LIKE '%Sample%')${tenantFilter}
      )${tenantFilter}
    `)
    await (tenantId ? cv1Query.bind(...[tenantId, tenantId]) : cv1Query).run()

    const wh1Query = db.prepare(`
      DELETE FROM workflow_history
      WHERE content_id IN (
        SELECT id FROM content
        WHERE (title LIKE 'Test %' OR title LIKE '%E2E%' OR title LIKE '%Playwright%' OR title LIKE '%Sample%')${tenantFilter}
      )${tenantFilter}
    `)
    await (tenantId ? wh1Query.bind(...[tenantId, tenantId]) : wh1Query).run()

    // Note: content_data table may not exist in all schemas
    try {
      const cd1Query = db.prepare(`
        DELETE FROM content_data
        WHERE content_id IN (
          SELECT id FROM content
          WHERE (title LIKE 'Test %' OR title LIKE '%E2E%' OR title LIKE '%Playwright%' OR title LIKE '%Sample%')${tenantFilter}
        )${tenantFilter}
      `)
      await (tenantId ? cd1Query.bind(...[tenantId, tenantId]) : cd1Query).run()
    } catch (e) {
      // Table doesn't exist, skip
    }

    // Step 2: Delete test content by pattern
    const contentQuery = db.prepare(`
      DELETE FROM content
      WHERE (title LIKE 'Test %' OR title LIKE '%E2E%' OR title LIKE '%Playwright%' OR title LIKE '%Sample%')${tenantFilter}
    `)
    const contentResult = await (tenantId ? contentQuery.bind(tenantId) : contentQuery).run()
    deletedCount += contentResult.meta?.changes || 0

    // Step 3: Delete child data for test users
    const atQuery = db.prepare(`
      DELETE FROM api_tokens
      WHERE user_id IN (
        SELECT id FROM users
        WHERE email != 'admin@sonicjs.com' AND (email LIKE '%test%' OR email LIKE '%example.com%')${tenantFilter}
      )${tenantFilter}
    `)
    await (tenantId ? atQuery.bind(...[tenantId, tenantId]) : atQuery).run()

    const mediaQuery = db.prepare(`
      DELETE FROM media
      WHERE uploaded_by IN (
        SELECT id FROM users
        WHERE email != 'admin@sonicjs.com' AND (email LIKE '%test%' OR email LIKE '%example.com%')${tenantFilter}
      )${tenantFilter}
    `)
    await (tenantId ? mediaQuery.bind(...[tenantId, tenantId]) : mediaQuery).run()

    // Step 4: Delete test users
    const usersQuery = db.prepare(`
      DELETE FROM users
      WHERE email != 'admin@sonicjs.com' AND (email LIKE '%test%' OR email LIKE '%example.com%')${tenantFilter}
    `)
    const usersResult = await (tenantId ? usersQuery.bind(tenantId) : usersQuery).run()
    deletedCount += usersResult.meta?.changes || 0

    // Step 5: Delete child data for test collections
    try {
      const cfQuery = db.prepare(`
        DELETE FROM collection_fields
        WHERE collection_id IN (
          SELECT id FROM collections
          WHERE (name LIKE 'test_%' OR name IN ('blog_posts', 'test_collection', 'products', 'articles'))${tenantFilter}
        )${tenantFilter}
      `)
      await (tenantId ? cfQuery.bind(...[tenantId, tenantId]) : cfQuery).run()
    } catch (e) {
      // Table doesn't exist
    }

    // Delete remaining content from test collections
    const contentByCollQuery = db.prepare(`
      DELETE FROM content
      WHERE collection_id IN (
        SELECT id FROM collections
        WHERE (name LIKE 'test_%' OR name IN ('blog_posts', 'test_collection', 'products', 'articles'))${tenantFilter}
      )${tenantFilter}
    `)
    await (tenantId ? contentByCollQuery.bind(...[tenantId, tenantId]) : contentByCollQuery).run()

    // Step 6: Delete test collections
    const collectionsQuery = db.prepare(`
      DELETE FROM collections
      WHERE (name LIKE 'test_%' OR name IN ('blog_posts', 'test_collection', 'products', 'articles'))${tenantFilter}
    `)
    const collectionsResult = await (tenantId ? collectionsQuery.bind(tenantId) : collectionsQuery).run()
    deletedCount += collectionsResult.meta?.changes || 0

    // Step 7: Clean up orphaned data (skip if tables don't exist)
    try {
      const orphanCdQuery = db.prepare(`
        DELETE FROM content_data WHERE content_id NOT IN (SELECT id FROM content)${tenantFilter}
      `)
      await (tenantId ? orphanCdQuery.bind(tenantId) : orphanCdQuery).run()
    } catch (e) {
      // Table doesn't exist
    }

    try {
      const orphanCfQuery = db.prepare(`
        DELETE FROM collection_fields WHERE collection_id NOT IN (SELECT id FROM collections)${tenantFilter}
      `)
      await (tenantId ? orphanCfQuery.bind(tenantId) : orphanCfQuery).run()
    } catch (e) {
      // Table doesn't exist
    }

    try {
      const orphanCvQuery = db.prepare(`
        DELETE FROM content_versions WHERE content_id NOT IN (SELECT id FROM content)${tenantFilter}
      `)
      await (tenantId ? orphanCvQuery.bind(tenantId) : orphanCvQuery).run()
    } catch (e) {
      // Table doesn't exist
    }

    try {
      const orphanWhQuery = db.prepare(`
        DELETE FROM workflow_history WHERE content_id NOT IN (SELECT id FROM content)${tenantFilter}
      `)
      await (tenantId ? orphanWhQuery.bind(tenantId) : orphanWhQuery).run()
    } catch (e) {
      // Table doesn't exist
    }

    // Step 8: Delete old activity logs (keep only last 100)
    const alQuery = db.prepare(`
      DELETE FROM activity_logs
      WHERE id NOT IN (
        SELECT id FROM activity_logs
        ORDER BY created_at DESC
        LIMIT 100
      )${tenantFilter}
    `)
    await (tenantId ? alQuery.bind(tenantId) : alQuery).run()

    return c.json({
      success: true,
      deletedCount,
      message: 'Test data cleaned up successfully'
    })
  } catch (error) {
    console.error('Test cleanup error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

/**
 * Clean up test users only
 * POST /test-cleanup/users
 */
app.post('/test-cleanup/users', async (c: Context) => {
  const db = c.env.DB as D1Database

  // Only allow in development/test environments
  if (c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'Cleanup endpoint not available in production' }, 403)
  }

  try {
    const tenantId = getTenantIdOrNull(c)
    const tenantFilter = tenantId ? ' AND tenant_id = ?' : ''

    // Delete test users (preserve admin)
    const query = db.prepare(`
      DELETE FROM users
      WHERE email != 'admin@sonicjs.com'
      AND (
        email LIKE '%test%'
        OR email LIKE '%example.com%'
        OR first_name = 'Test'
      )${tenantFilter}
    `)
    const result = await (tenantId ? query.bind(tenantId) : query).run()

    return c.json({
      success: true,
      deletedCount: result.meta?.changes || 0,
      message: 'Test users cleaned up successfully'
    })
  } catch (error) {
    console.error('User cleanup error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

/**
 * Clean up test collections only
 * POST /test-cleanup/collections
 */
app.post('/test-cleanup/collections', async (c: Context) => {
  const db = c.env.DB as D1Database

  // Only allow in development/test environments
  if (c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'Cleanup endpoint not available in production' }, 403)
  }

  try {
    let deletedCount = 0
    const tenantId = getTenantIdOrNull(c)
    const tenantFilter = tenantId ? ' AND tenant_id = ?' : ''

    // Get test collection IDs first
    const collectionsQuery = db.prepare(`
      SELECT id FROM collections
      WHERE (name LIKE 'test_%'
      OR name IN ('blog_posts', 'test_collection', 'products', 'articles'))${tenantFilter}
    `)
    const collections = await (tenantId ? collectionsQuery.bind(tenantId) : collectionsQuery).all()

    if (collections.results && collections.results.length > 0) {
      const collectionIds = collections.results.map((c: any) => c.id)

      // Delete associated fields
      for (const id of collectionIds) {
        const cfQuery = db.prepare(`DELETE FROM collection_fields WHERE collection_id = ?${tenantFilter}`)
        await (tenantId ? cfQuery.bind(id, tenantId) : cfQuery.bind(id)).run()
      }

      // Delete associated content
      for (const id of collectionIds) {
        const contentQuery = db.prepare(`DELETE FROM content WHERE collection_id = ?${tenantFilter}`)
        await (tenantId ? contentQuery.bind(id, tenantId) : contentQuery.bind(id)).run()
      }

      // Delete the collections
      const binds = tenantId ? [...collectionIds, tenantId] : collectionIds
      const result = await db.prepare(`
        DELETE FROM collections
        WHERE id IN (${collectionIds.map(() => '?').join(',')})${tenantFilter}
      `).bind(...binds).run()

      deletedCount = result.meta?.changes || 0
    }

    return c.json({
      success: true,
      deletedCount,
      message: 'Test collections cleaned up successfully'
    })
  } catch (error) {
    console.error('Collection cleanup error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

/**
 * Clean up test content only
 * POST /test-cleanup/content
 */
app.post('/test-cleanup/content', async (c: Context) => {
  const db = c.env.DB as D1Database

  // Only allow in development/test environments
  if (c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'Cleanup endpoint not available in production' }, 403)
  }

  try {
    const tenantId = getTenantIdOrNull(c)
    const tenantFilter = tenantId ? ' AND tenant_id = ?' : ''

    // Delete test content
    const contentQuery = db.prepare(`
      DELETE FROM content
      WHERE (title LIKE 'Test %'
      OR title LIKE '%E2E%'
      OR title LIKE '%Playwright%'
      OR title LIKE '%Sample%')${tenantFilter}
    `)
    const result = await (tenantId ? contentQuery.bind(tenantId) : contentQuery).run()

    // Clean up orphaned content_data
    const orphanQuery = db.prepare(`
      DELETE FROM content_data
      WHERE content_id NOT IN (SELECT id FROM content)${tenantFilter}
    `)
    await (tenantId ? orphanQuery.bind(tenantId) : orphanQuery).run()

    return c.json({
      success: true,
      deletedCount: result.meta?.changes || 0,
      message: 'Test content cleaned up successfully'
    })
  } catch (error) {
    console.error('Content cleanup error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

export default app
