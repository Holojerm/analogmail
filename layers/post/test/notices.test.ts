// Notices: the notice email, sending, and bounces, against a real D1.

import { env } from 'cloudflare:test'
import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import type { SendEmailOptions, SendEmailResult } from '#server/utils/email'

import { handleNoticeBounce, isHardBounce } from '../server/notify/bounce'
import { dispatchNotices, NOTICE_EXPIRY_MS } from '../server/notify/dispatch'
import { createEmailNotifier, NOTICE_SUBJECT, noticeEmail } from '../server/notify/email'
import type { Notifier, NotifyResult } from '../server/notify/notifier'
import { NOTICE_PUSH } from '../server/notify/push'
import { verifySvixSignature } from '../server/notify/svix'
import { runRelease } from '../server/utils/release-run'

const db = drizzle(env.DB, { schema })
const { users, postalProfiles, deliveries, notices, letters, opsEvents } = schema
const utc = (iso: string) => new Date(`${iso}Z`)
const brand = { appName: 'Dear Mantel', appUrl: 'https://dearmantel.example' }
const MONDAY_TEN = utc('2026-11-16T16:00:00')

function recorder(results: NotifyResult[] = []) {
  const calls: { userId: string; address: string }[] = []
  const notifier: Notifier = {
    channel: 'email',
    ready: () => true,
    async notify(notice) {
      calls.push(notice)
      return results.shift() ?? { ok: true }
    },
  }
  return { calls, notifier }
}

async function addPerson(id: string) {
  await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
  await db.insert(postalProfiles).values({
    userId: id,
    cityName: 'Chicago',
    country: 'US',
    lat: 41.8781,
    lng: -87.6298,
    timeZone: 'America/Chicago',
    nextReleaseAt: MONDAY_TEN,
  })
}

/** A letter from `authorId`, in the post to `recipientId`. */
async function post(authorId: string, recipientId: string, earliestDate: string) {
  const [letter] = await db
    .insert(letters)
    .values({ correspondenceId: 'pair', authorId, ciphertext: 'sealed' })
    .returning()
  const [delivery] = await db
    .insert(deliveries)
    .values({
      letterId: letter!.id,
      recipientId,
      earliestDate,
      promisedDate: earliestDate,
      transitDays: 3,
    })
    .returning()
  return delivery!
}

const noticesOf = (userId: string) =>
  db.select().from(notices).where(eq(notices.userId, userId)).orderBy(asc(notices.mailDate))
const mailOf = (userId: string) =>
  db.select().from(deliveries).where(eq(deliveries.recipientId, userId))

beforeEach(async () => {
  for (const table of [deliveries, notices, letters, postalProfiles, opsEvents, users]) {
    await db.delete(table)
  }
})

describe('the notice email', () => {
  it('says something arrived and links to the mantel with no token', () => {
    const email = noticeEmail(brand)

    expect(email.subject).toBe(NOTICE_SUBJECT)
    expect(email.text).toContain('Sign in to open your mantel.')
    expect(email.text).toContain('https://dearmantel.example/mantel\n')
    expect(email.html).toContain('href="https://dearmantel.example/mantel"')
    expect(email.text + email.html).not.toMatch(/mantel\?|token=/)
  })

  it('reports a refused address as not worth retrying', async () => {
    const sent: SendEmailOptions[] = []
    const send = (result: SendEmailResult) => async (options: SendEmailOptions) => {
      sent.push(options)
      return result
    }
    const notice = { userId: 'ann', address: 'ann@example.com' }
    const using = (result: SendEmailResult) =>
      createEmailNotifier({ brand, configured: true, send: send(result) }).notify(notice)

    expect(await using({ sent: true, id: null, queued: true })).toEqual({ ok: true })
    expect(await using({ sent: false, reason: 'rejected' })).toMatchObject({ retry: false })
    expect(await using({ sent: false, reason: 'error' })).toMatchObject({ retry: true })
    expect(sent[0]).toMatchObject({ to: 'ann@example.com', subject: NOTICE_SUBJECT })
    expect(Object.keys(sent[0]!).sort()).toEqual(['html', 'subject', 'text', 'to'])
  })
})

describe('sending notices', () => {
  beforeEach(async () => {
    await addPerson('ann')
    await addPerson('bob')
    await post('bob', 'ann', '2026-11-16')
    await post('bob', 'ann', '2026-11-16')
    await runRelease(db, MONDAY_TEN)
  })

  it('tells each person once, with nothing but who to tell', async () => {
    const { calls, notifier } = recorder()

    const first = await dispatchNotices(db, notifier, MONDAY_TEN)
    const second = await dispatchNotices(db, notifier, utc('2026-11-16T16:15:00'))

    expect(first).toMatchObject({ sent: 1, failed: 0 })
    expect(second).toMatchObject({ sent: 0 })
    expect(calls).toEqual([{ userId: 'ann', address: 'ann@example.com' }])
    expect(await noticesOf('ann')).toMatchObject([
      { state: 'sent', sentAt: MONDAY_TEN, attempts: 1 },
    ])
  })

  it('tries again on later runs, then gives up and says so', async () => {
    const down: NotifyResult = { ok: false, retry: true, reason: 'error' }
    const { calls, notifier } = recorder([down, down, down])

    expect(await dispatchNotices(db, notifier, MONDAY_TEN)).toMatchObject({ retrying: 1 })
    expect(await dispatchNotices(db, notifier, MONDAY_TEN)).toMatchObject({ retrying: 1 })
    expect(await dispatchNotices(db, notifier, MONDAY_TEN)).toMatchObject({ failed: 1 })
    await dispatchNotices(db, notifier, MONDAY_TEN)

    expect(calls).toHaveLength(3)
    expect(await noticesOf('ann')).toMatchObject([{ state: 'failed', attempts: 3 }])
    expect(await db.select().from(opsEvents)).toMatchObject([{ kind: 'notice_failed' }])
  })

  it('does not retry an address the channel refused', async () => {
    const { calls, notifier } = recorder([{ ok: false, retry: false, reason: 'rejected' }])

    await dispatchNotices(db, notifier, MONDAY_TEN)
    await dispatchNotices(db, notifier, MONDAY_TEN)

    expect(calls).toHaveLength(1)
    expect(await noticesOf('ann')).toMatchObject([{ state: 'failed' }])
  })

  it('waits while the channel is not configured, then drops what went stale', async () => {
    const { calls, notifier } = recorder()
    const unready = { ...notifier, ready: () => false }

    const waiting = await dispatchNotices(db, unready, MONDAY_TEN)
    expect(waiting).toMatchObject({ skipped: true, expired: 0 })
    expect(await noticesOf('ann')).toMatchObject([{ state: 'pending' }])

    const late = new Date(MONDAY_TEN.getTime() + NOTICE_EXPIRY_MS + 1000)
    expect(await dispatchNotices(db, notifier, late)).toMatchObject({ expired: 1, sent: 0 })
    expect(calls).toHaveLength(0)
    expect(await noticesOf('ann')).toMatchObject([{ state: 'failed' }])
    expect(await db.select().from(opsEvents)).toHaveLength(0)
  })

  it('never mails a deleted account', async () => {
    await db.delete(users).where(eq(users.id, 'ann'))
    const { calls, notifier } = recorder()
    const pushed: string[] = []
    const push = async (userId: string) => pushed.push(userId)

    expect(await dispatchNotices(db, notifier, MONDAY_TEN, { push })).toMatchObject({ failed: 1 })
    expect(calls).toHaveLength(0)
    expect(pushed).toHaveLength(0)
  })
})

describe('the notice as a notification', () => {
  beforeEach(async () => {
    await addPerson('ann')
    await addPerson('bob')
    await post('bob', 'ann', '2026-11-16')
    await runRelease(db, MONDAY_TEN)
  })

  it('says what the email says and nothing more', () => {
    expect(NOTICE_PUSH).toEqual({
      title: 'Something arrived on your mantel',
      body: 'Open your mantel to read it.',
      url: '/mantel',
    })
  })

  it('goes beside the email, once, counting the devices that took it', async () => {
    const { calls, notifier } = recorder()
    const pushed: string[] = []
    const push = async (userId: string) => pushed.push(userId) && 2

    const first = await dispatchNotices(db, notifier, MONDAY_TEN, { push })
    const second = await dispatchNotices(db, notifier, utc('2026-11-16T16:15:00'), { push })

    expect(first).toMatchObject({ sent: 1, pushed: 2 })
    expect(second).toMatchObject({ sent: 0, pushed: 0 })
    expect(calls).toHaveLength(1)
    expect(pushed).toEqual(['ann'])
  })

  it('is not repeated when the email is tried again', async () => {
    const down: NotifyResult = { ok: false, retry: true, reason: 'error' }
    const { calls, notifier } = recorder([down, down])
    const pushed: string[] = []
    const push = async (userId: string) => pushed.push(userId)

    await dispatchNotices(db, notifier, MONDAY_TEN, { push })
    await dispatchNotices(db, notifier, MONDAY_TEN, { push })
    await dispatchNotices(db, notifier, MONDAY_TEN, { push })

    expect(calls).toHaveLength(3)
    expect(pushed).toEqual(['ann'])
    expect(await noticesOf('ann')).toMatchObject([{ state: 'sent', attempts: 3 }])
  })

  it('never costs the notice its email when it fails', async () => {
    const { calls, notifier } = recorder()
    const push = async () => {
      throw new Error('push is down')
    }

    expect(await dispatchNotices(db, notifier, MONDAY_TEN, { push })).toMatchObject({
      sent: 1,
      pushed: 0,
    })
    expect(calls).toHaveLength(1)
    expect(await db.select().from(opsEvents)).toHaveLength(0)
  })

  it('waits with the email while the channel is not configured', async () => {
    const { notifier } = recorder()
    const pushed: string[] = []
    const push = async (userId: string) => pushed.push(userId)

    await dispatchNotices(db, { ...notifier, ready: () => false }, MONDAY_TEN, { push })
    expect(pushed).toHaveLength(0)
  })
})

describe('a bounced notice', () => {
  const bounced = { address: 'Ann@Example.com', emailCreatedAt: utc('2026-11-16T16:01:00') }
  const later = utc('2026-11-16T16:20:00')

  beforeEach(async () => {
    await addPerson('ann')
    await addPerson('bob')
    await post('bob', 'ann', '2026-11-16')
    await post('bob', 'ann', '2026-11-18')
    await runRelease(db, MONDAY_TEN)
    await dispatchNotices(db, recorder().notifier, MONDAY_TEN)
  })

  it("returns that day's unopened letters to their sender", async () => {
    const result = await handleNoticeBounce(db, bounced, later)

    expect(result).toEqual({ outcome: 'bounced', returned: 1 })
    expect(await noticesOf('ann')).toMatchObject([{ state: 'bounced' }])
    const mail = await mailOf('ann')
    expect(mail.map((row) => row.state).sort()).toEqual(['in_transit', 'returned'])
    expect(await mailOf('bob')).toMatchObject([{ kind: 'return', state: 'in_transit' }])
    expect(await db.select().from(opsEvents)).toMatchObject([{ kind: 'notice_bounced' }])
  })

  it('leaves a letter that was already opened', async () => {
    await db
      .update(deliveries)
      .set({ openedAt: utc('2026-11-16T16:05:00') })
      .where(eq(deliveries.state, 'delivered'))

    expect(await handleNoticeBounce(db, bounced, later)).toEqual({
      outcome: 'bounced',
      returned: 0,
    })
    expect(await mailOf('bob')).toHaveLength(0)
  })

  it('does nothing the second time the same event arrives', async () => {
    await handleNoticeBounce(db, bounced, later)

    expect(await handleNoticeBounce(db, bounced, later)).toEqual({
      outcome: 'duplicate',
      returned: 0,
    })
    expect(await mailOf('bob')).toHaveLength(1)
    expect(await db.select().from(opsEvents)).toHaveLength(1)
  })

  it('picks the notice nearest the email, not the latest one', async () => {
    await runRelease(db, utc('2026-11-18T16:00:00'))
    await dispatchNotices(db, recorder().notifier, utc('2026-11-18T16:00:00'))

    await handleNoticeBounce(db, bounced, utc('2026-11-18T17:00:00'))

    expect(await noticesOf('ann')).toMatchObject([
      { mailDate: '2026-11-16', state: 'bounced' },
      { mailDate: '2026-11-18', state: 'sent' },
    ])
  })

  it('ignores an address it does not know and mail that is not a notice', async () => {
    const stranger = { ...bounced, address: 'nobody@example.com' }
    const longAgo = { ...bounced, emailCreatedAt: utc('2026-11-10T16:00:00') }

    expect((await handleNoticeBounce(db, stranger, later)).outcome).toBe('ignored')
    expect((await handleNoticeBounce(db, longAgo, later)).outcome).toBe('ignored')
    expect(await noticesOf('ann')).toMatchObject([{ state: 'sent' }])
  })

  it('counts only permanent bounces and suppressions as hard', () => {
    const event = (type: string, bounce?: { type: string }) => ({ type, data: { to: [], bounce } })

    expect(isHardBounce(event('email.bounced', { type: 'Permanent' }))).toBe(true)
    expect(isHardBounce(event('email.suppressed'))).toBe(true)
    expect(isHardBounce(event('email.bounced', { type: 'Temporary' }))).toBe(false)
    expect(isHardBounce(event('email.bounced'))).toBe(false)
    expect(isHardBounce(event('email.delivered'))).toBe(false)
  })
})

describe('the webhook signature', () => {
  // The worked example from Svix's manual-verification guide.
  const secret = 'whsec_plJ3nmyCDGBKInavdOK15jsl'
  const body = '{"event_type":"ping","data":{"success":true}}'
  const headers = {
    id: 'msg_loFOjxBNrRLzqYUf',
    timestamp: '1731705121',
    signature: 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=',
  }
  const then = new Date(1731705121 * 1000)

  it('accepts a correctly signed body', async () => {
    expect(await verifySvixSignature(secret, headers, body, then)).toBe(true)
  })

  it('accepts it among several signatures', async () => {
    const several = { ...headers, signature: `v1,AAAA v2,zzzz ${headers.signature}` }
    expect(await verifySvixSignature(secret, several, body, then)).toBe(true)
  })

  it('rejects a changed body, a wrong secret, a stale timestamp and missing headers', async () => {
    const stale = new Date(then.getTime() + 6 * 60 * 1000)
    const other = 'whsec_AAAAAAAAAAAAAAAAAAAAAAAA'

    expect(await verifySvixSignature(secret, headers, `${body} `, then)).toBe(false)
    expect(await verifySvixSignature(other, headers, body, then)).toBe(false)
    expect(await verifySvixSignature(secret, headers, body, stale)).toBe(false)
    expect(await verifySvixSignature(secret, { ...headers, id: null }, body, then)).toBe(false)
    expect(await verifySvixSignature(secret, { ...headers, signature: 'v1,' }, body, then)).toBe(
      false,
    )
  })
})
