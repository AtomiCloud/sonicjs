// @ts-nocheck
import { D1Database } from '@cloudflare/workers-types'

export interface ScheduledContent {
  id: string
  content_id: string
  action: 'publish' | 'unpublish' | 'archive'
  scheduled_at: string
  timezone: string
  user_id: string
  status: 'pending' | 'completed' | 'failed' | 'cancelled'
  executed_at?: string
  error_message?: string
}

export class SchedulerService {
  constructor(private db: D1Database, private tenantId: string | null = null) {}

  async scheduleContent(
    contentId: string,
    action: 'publish' | 'unpublish' | 'archive',
    scheduledAt: Date,
    timezone: string = 'UTC',
    userId: string
  ): Promise<string> {
    const scheduleId = globalThis.crypto.randomUUID()
    
    await this.db.prepare(`
      INSERT INTO scheduled_content 
      (id, content_id, action, scheduled_at, timezone, user_id, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      scheduleId,
      contentId,
      action,
      scheduledAt.toISOString(),
      timezone,
      userId
    ).run()

    return scheduleId
  }

  async updateScheduledContent(
    scheduleId: string,
    scheduledAt: Date,
    timezone?: string
  ): Promise<boolean> {
    try {
      const query = timezone 
        ? `UPDATE scheduled_content SET scheduled_at = ?, timezone = ?, status = 'pending' WHERE id = ?`
        : `UPDATE scheduled_content SET scheduled_at = ?, status = 'pending' WHERE id = ?`
      
      const params = timezone 
        ? [scheduledAt.toISOString(), timezone, scheduleId]
        : [scheduledAt.toISOString(), scheduleId]

      await this.db.prepare(query).bind(...params).run()
      return true
    } catch (error) {
      console.error('Failed to update scheduled content:', error)
      return false
    }
  }

  async cancelScheduledContent(scheduleId: string): Promise<boolean> {
    try {
      await this.db.prepare(`
        UPDATE scheduled_content 
        SET status = 'cancelled' 
        WHERE id = ? AND status = 'pending'
      `).bind(scheduleId).run()
      return true
    } catch (error) {
      console.error('Failed to cancel scheduled content:', error)
      return false
    }
  }

  async getPendingScheduledContent(limit: number = 100): Promise<ScheduledContent[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM scheduled_content 
      WHERE status = 'pending' AND scheduled_at <= datetime('now')
      ORDER BY scheduled_at ASC
      LIMIT ?
    `).bind(limit).all()
    
    return results as ScheduledContent[]
  }

  async getScheduledContentForUser(userId: string): Promise<any[]> {
    const sql = this.tenantId
      ? `SELECT
          sc.*,
          c.title,
          c.slug,
          col.name as collection_name
        FROM scheduled_content sc
        JOIN content c ON sc.content_id = c.id
        JOIN collections col ON c.collection_id = col.id
        WHERE sc.user_id = ? AND sc.status = 'pending' AND c.tenant_id = ?
        ORDER BY sc.scheduled_at ASC`
      : `SELECT
          sc.*,
          c.title,
          c.slug,
          col.name as collection_name
        FROM scheduled_content sc
        JOIN content c ON sc.content_id = c.id
        JOIN collections col ON c.collection_id = col.id
        WHERE sc.user_id = ? AND sc.status = 'pending'
        ORDER BY sc.scheduled_at ASC`
    const params = this.tenantId ? [userId, this.tenantId] : [userId]
    const { results } = await this.db.prepare(sql).bind(...params).all()

    return results
  }

  async getScheduledContentForContent(contentId: string): Promise<ScheduledContent[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM scheduled_content 
      WHERE content_id = ? AND status = 'pending'
      ORDER BY scheduled_at ASC
    `).bind(contentId).all()
    
    return results as ScheduledContent[]
  }

  async executeScheduledAction(scheduleId: string): Promise<boolean> {
    try {
      // Get scheduled content
      const scheduled = await this.db.prepare(`
        SELECT * FROM scheduled_content WHERE id = ? AND status = 'pending'
      `).bind(scheduleId).first() as ScheduledContent | null

      if (!scheduled) {
        return false
      }

      // Execute the action
      let success = false
      let errorMessage = ''

      switch (scheduled.action) {
        case 'publish':
          success = await this.publishContent(scheduled.content_id)
          break
        case 'unpublish':
          success = await this.unpublishContent(scheduled.content_id)
          break
        case 'archive':
          success = await this.archiveContent(scheduled.content_id)
          break
      }

      // Update scheduled content status
      await this.db.prepare(`
        UPDATE scheduled_content 
        SET status = ?, executed_at = CURRENT_TIMESTAMP, error_message = ?
        WHERE id = ?
      `).bind(
        success ? 'completed' : 'failed',
        success ? null : errorMessage,
        scheduleId
      ).run()

      return success
    } catch (error) {
      console.error('Failed to execute scheduled action:', error)
      
      // Mark as failed
      await this.db.prepare(`
        UPDATE scheduled_content 
        SET status = 'failed', executed_at = CURRENT_TIMESTAMP, error_message = ?
        WHERE id = ?
      `).bind(error.message, scheduleId).run()

      return false
    }
  }

  private async publishContent(contentId: string): Promise<boolean> {
    try {
      const publishSql = this.tenantId
        ? `UPDATE content SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`
        : `UPDATE content SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?`
      const publishParams = this.tenantId
        ? [Date.now(), Date.now(), contentId, this.tenantId]
        : [Date.now(), Date.now(), contentId]
      await this.db.prepare(publishSql).bind(...publishParams).run()

      // Update workflow state if exists
      await this.db.prepare(`
        UPDATE content_workflow_status
        SET current_state_id = 'published', updated_at = CURRENT_TIMESTAMP
        WHERE content_id = ?
      `).bind(contentId).run()

      const updateWfSql = this.tenantId
        ? `UPDATE content SET workflow_state_id = 'published' WHERE id = ? AND tenant_id = ?`
        : `UPDATE content SET workflow_state_id = 'published' WHERE id = ?`
      const updateWfParams = this.tenantId ? [contentId, this.tenantId] : [contentId]
      await this.db.prepare(updateWfSql).bind(...updateWfParams).run()

      return true
    } catch (error) {
      console.error('Failed to publish content:', error)
      return false
    }
  }

  private async unpublishContent(contentId: string): Promise<boolean> {
    try {
      const unpublishSql = this.tenantId
        ? `UPDATE content SET status = 'draft', published_at = NULL, updated_at = ? WHERE id = ? AND tenant_id = ?`
        : `UPDATE content SET status = 'draft', published_at = NULL, updated_at = ? WHERE id = ?`
      const unpublishParams = this.tenantId
        ? [Date.now(), contentId, this.tenantId]
        : [Date.now(), contentId]
      await this.db.prepare(unpublishSql).bind(...unpublishParams).run()

      // Update workflow state if exists
      await this.db.prepare(`
        UPDATE content_workflow_status
        SET current_state_id = 'draft', updated_at = CURRENT_TIMESTAMP
        WHERE content_id = ?
      `).bind(contentId).run()

      const updateWfSql = this.tenantId
        ? `UPDATE content SET workflow_state_id = 'draft' WHERE id = ? AND tenant_id = ?`
        : `UPDATE content SET workflow_state_id = 'draft' WHERE id = ?`
      const updateWfParams = this.tenantId ? [contentId, this.tenantId] : [contentId]
      await this.db.prepare(updateWfSql).bind(...updateWfParams).run()

      return true
    } catch (error) {
      console.error('Failed to unpublish content:', error)
      return false
    }
  }

  private async archiveContent(contentId: string): Promise<boolean> {
    try {
      const archiveSql = this.tenantId
        ? `UPDATE content SET status = 'archived', updated_at = ? WHERE id = ? AND tenant_id = ?`
        : `UPDATE content SET status = 'archived', updated_at = ? WHERE id = ?`
      const archiveParams = this.tenantId
        ? [Date.now(), contentId, this.tenantId]
        : [Date.now(), contentId]
      await this.db.prepare(archiveSql).bind(...archiveParams).run()

      // Update workflow state if exists
      await this.db.prepare(`
        UPDATE content_workflow_status
        SET current_state_id = 'archived', updated_at = CURRENT_TIMESTAMP
        WHERE content_id = ?
      `).bind(contentId).run()

      const updateWfSql = this.tenantId
        ? `UPDATE content SET workflow_state_id = 'archived' WHERE id = ? AND tenant_id = ?`
        : `UPDATE content SET workflow_state_id = 'archived' WHERE id = ?`
      const updateWfParams = this.tenantId ? [contentId, this.tenantId] : [contentId]
      await this.db.prepare(updateWfSql).bind(...updateWfParams).run()

      return true
    } catch (error) {
      console.error('Failed to archive content:', error)
      return false
    }
  }

  // Method to be called by a cron job or scheduled function
  async processScheduledContent(): Promise<{ processed: number; errors: number }> {
    const pendingContent = await this.getPendingScheduledContent(50)
    let processed = 0
    let errors = 0

    for (const scheduled of pendingContent) {
      const success = await this.executeScheduledAction(scheduled.id)
      if (success) {
        processed++
      } else {
        errors++
      }
    }

    return { processed, errors }
  }

  async getScheduledContentStats(): Promise<{
    pending: number
    completed: number
    failed: number
    cancelled: number
  }> {
    const stats = await this.db.prepare(`
      SELECT 
        status,
        COUNT(*) as count
      FROM scheduled_content 
      GROUP BY status
    `).all()

    const result = {
      pending: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    }

    for (const stat of stats.results) {
      result[stat.status as keyof typeof result] = stat.count as number
    }

    return result
  }
}