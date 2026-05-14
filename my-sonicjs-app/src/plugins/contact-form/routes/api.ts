import { Hono } from 'hono'
import { ContactService } from '../services/contact'

const apiRoutes = new Hono()

/**
 * POST /
 * Submit a contact form message.
 * This router is mounted at /api/contact so it does not claim the entire /api namespace.
 */
apiRoutes.post('/', async (c: any) => {
  try {
    const db = c.get('db') || c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Service unavailable' }, 503)
    }

    const service = new ContactService(db)

    let data: any = {}
    const contentType = c.req.header('content-type') || ''

    if (contentType.includes('application/json')) {
      data = await c.req.json()
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await c.req.formData()
      formData.forEach((value, key) => {
        data[key] = value
      })
    }

    if (!data.name || !data.email || !data.msg) {
      return c.json({
        success: false,
        error: 'All fields are required'
      }, 400)
    }

    const { data: settings } = await service.getSettings()
    const useTurnstile = settings.useTurnstile === 1 || settings.useTurnstile === true || settings.useTurnstile === 'true' || settings.useTurnstile === 'on'

    if (useTurnstile) {
      const token = data['cf-turnstile-response']

      if (!token) {
        return c.json({
          success: false,
          error: 'Security verification required'
        }, 400)
      }

      try {
        const turnstilePlugin = await db
          .prepare(`SELECT settings FROM plugins WHERE id = ? AND status = 'active'`)
          .bind('turnstile')
          .first()

        if (!turnstilePlugin || !turnstilePlugin.settings) {
          console.error('Turnstile plugin not available or not configured')
          return c.json({
            success: false,
            error: 'Security verification unavailable'
          }, 500)
        }

        const turnstileSettings = JSON.parse(turnstilePlugin.settings as string)
        const secretKey = turnstileSettings.secretKey

        if (!secretKey) {
          console.error('Turnstile secret key not configured')
          return c.json({
            success: false,
            error: 'Security verification unavailable'
          }, 500)
        }

        const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            secret: secretKey,
            response: token
          })
        })

        const verifyResult = await verifyResponse.json() as any

        if (!verifyResult.success) {
          console.error('Turnstile verification failed:', verifyResult['error-codes'])
          return c.json({
            success: false,
            error: 'Security verification failed. Please try again.'
          }, 400)
        }

        console.log('Turnstile verification successful')
      } catch (error) {
        console.error('Error verifying Turnstile token:', error)
        return c.json({
          success: false,
          error: 'Security verification error'
        }, 500)
      }
    }

    delete data['cf-turnstile-response']

    await service.saveMessage(data)

    return c.json({
      success: true,
      message: 'Message sent successfully'
    })
  } catch (error) {
    console.error('Error saving contact message:', error)
    return c.json({
      success: false,
      error: 'Failed to send message'
    }, 500)
  }
})

export default apiRoutes
