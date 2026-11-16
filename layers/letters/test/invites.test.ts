// Invitations against a real D1: what one stores, who may accept it, what
// accepting creates, and what is deleted when it lapses.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import { getAccountContributors, clearExtensionsForTest } from '#server/utils/extensions'

import { acceptInvite } from '../server/utils/accept-invite'
import { listPeople, openCorrespondenceBetween } from '../server/utils/correspondences'
import { inviteEmail, inviteSubject } from '../server/utils/invite-email'
import { createInvite, hashInviteToken, viewInvite, withdrawInvite } from '../server/utils/invites'
import { purgeExpiredInvites, registerLettersExtensions } from '../server/utils/letters-extensions'
import { getDisplayName, setDisplayName } from '../server/utils/people'
import { displayNameSchema, INVITE_TTL_MS, MAX_OPEN_INVITES } from '../shared/utils/invites'

const db = drizzle(env.DB, { schema })
const { users, people, invites, correspondences, correspondenceMembers, postalProfiles } = schema

const NOW = new Date('2026-11-16T15:00:00Z')
const later = (ms: number) => new Date(NOW.getTime() + ms)
const DAY = 24 * 60 * 60 * 1000

const ann = { id: 'ann', email: 'ann@example.com' }
const bob = { id: 'bob', email: 'bob@example.com' }

async function settle(id: string, name: string | null) {
  if (name) await setDisplayName(db, id, name)
  await db.insert(postalProfiles).values({
    userId: id,
    cityName: 'Chicago',
    country: 'US',
    lat: 41.85,
    lng: -87.65,
    timeZone: 'America/Chicago',
  })
}

async function invited(email = bob.email) {
  const result = await createInvite(db, ann, email, NOW)
  if (result.status !== 'created') throw new Error(`expected an invite, got ${result.status}`)
  return result
}

beforeEach(async () => {
  for (const table of [invites, correspondenceMembers, correspondences, people, postalProfiles]) {
    await db.delete(table)
  }
  await db.delete(users)
  for (const person of [ann, bob, { id: 'cy', email: 'cy@example.com' }]) {
    await db.insert(users).values({ ...person, name: person.id })
  }
  await settle('ann', 'Ann Lee')
})

describe('display names', () => {
  it('accepts names and refuses anything that reads as a link or an address', () => {
    expect(displayNameSchema.parse('  José   Álvarez-O’Neil ')).toBe('José Álvarez-O’Neil')
    expect(displayNameSchema.parse('Ann\nLee')).toBe('Ann Lee')
    expect(displayNameSchema.parse('J. R. Tolkien')).toBe('J. R. Tolkien')
    for (const bad of ['', 'x'.repeat(41), 'bank.com', 'bank.com/login', 'a@b.co', '<b>Ann</b>']) {
      expect(displayNameSchema.safeParse(bad).success, bad).toBe(false)
    }
  })

  it('are stored as chosen and copied to the account', async () => {
    expect(await getDisplayName(db, 'bob')).toBeNull()
    await setDisplayName(db, 'bob', 'Bob')
    await setDisplayName(db, 'bob', 'Robert')
    expect(await getDisplayName(db, 'bob')).toBe('Robert')
    const [row] = await db.select().from(users).where(eq(users.id, 'bob'))
    expect(row?.name).toBe('Robert')
  })
})

describe('creating an invitation', () => {
  it('stores a hash of the token, the address and a 30-day expiry', async () => {
    const result = await invited('  Bob@Example.com ')
    const [row] = await db.select().from(invites)

    expect(row?.tokenHash).toBe(await hashInviteToken(result.token))
    expect(JSON.stringify(row)).not.toContain(result.token)
    expect(row?.inviteeEmail).toBe('bob@example.com')
    expect(row?.expiresAt.getTime()).toBe(NOW.getTime() + INVITE_TTL_MS)
    expect(result.inviterName).toBe('Ann Lee')
  })

  it('needs the inviter to have chosen a name', async () => {
    await db.delete(people)
    expect((await createInvite(db, ann, bob.email, NOW)).status).toBe('needs-name')
  })

  it('refuses the inviter’s own address and a second invitation to the same one', async () => {
    expect((await createInvite(db, ann, 'ANN@example.com', NOW)).status).toBe('self')
    await invited()
    expect((await createInvite(db, ann, bob.email, NOW)).status).toBe('pending')
    // Once the first has lapsed, a new one may go out.
    expect((await createInvite(db, ann, bob.email, later(INVITE_TTL_MS + 1))).status).toBe(
      'created',
    )
  })

  it('caps how many can be waiting at once', async () => {
    for (let i = 0; i < MAX_OPEN_INVITES; i += 1) await invited(`friend${i}@example.com`)
    expect((await createInvite(db, ann, 'one-more@example.com', NOW)).status).toBe('too-many')
  })

  it('can be withdrawn by its sender only, and only while it is waiting', async () => {
    const { id } = await invited()
    expect(await withdrawInvite(db, 'bob', id)).toBe(false)
    expect(await withdrawInvite(db, 'ann', id)).toBe(true)
    expect(await db.select().from(invites)).toHaveLength(0)
  })
})

describe('what the holder of a link sees', () => {
  it('is the sender’s name and whether the invitation stands, never the address', async () => {
    const { token } = await invited()
    const open = await viewInvite(db, token, NOW)

    expect(open).toMatchObject({ status: 'open', inviterName: 'Ann Lee' })
    expect(JSON.stringify(open)).not.toContain('bob@example.com')
    expect((await viewInvite(db, token, later(INVITE_TTL_MS))).status).toBe('expired')
    expect((await viewInvite(db, 'not-a-real-token-at-all-0000', NOW)).status).toBe('unknown')
  })
})

describe('accepting', () => {
  it('makes one correspondence with both people and forgets the address', async () => {
    const { token } = await invited()
    await settle('bob', 'Bob')

    const result = await acceptInvite(db, token, 'bob', later(DAY))
    expect(result.status).toBe('accepted')

    const members = await db.select().from(correspondenceMembers)
    expect(members.map((m) => m.userId).sort()).toEqual(['ann', 'bob'])
    expect(await db.select().from(correspondences)).toHaveLength(1)
    const [row] = await db.select().from(invites)
    expect(row).toMatchObject({ acceptedBy: 'bob', inviteeEmail: null })
    expect((await viewInvite(db, token, later(DAY))).status).toBe('accepted')
  })

  it('is safe to repeat and cannot be taken by a second person', async () => {
    const { token } = await invited()
    await settle('bob', 'Bob')
    await settle('cy', 'Cy')

    const first = await acceptInvite(db, token, 'bob', NOW)
    const again = await acceptInvite(db, token, 'bob', NOW)
    expect(again).toEqual(first)
    expect((await acceptInvite(db, token, 'cy', NOW)).status).toBe('used')
    expect(await db.select().from(correspondences)).toHaveLength(1)
  })

  it('finishes a claim whose correspondence was never written', async () => {
    const { token, id } = await invited()
    await settle('bob', 'Bob')
    await db.update(invites).set({ acceptedAt: NOW, acceptedBy: 'bob' }).where(eq(invites.id, id))

    expect((await acceptInvite(db, token, 'bob', later(DAY))).status).toBe('accepted')
    expect(await openCorrespondenceBetween(db, 'ann', 'bob')).not.toBeNull()
  })

  it('needs a name and a city, and refuses the sender, a lapsed link and an unknown one', async () => {
    const { token } = await invited()
    await db.insert(postalProfiles).values({
      userId: 'bob',
      cityName: 'Tokyo',
      country: 'JP',
      lat: 35.69,
      lng: 139.69,
      timeZone: 'Asia/Tokyo',
    })
    expect((await acceptInvite(db, token, 'bob', NOW)).status).toBe('needs-name')
    await setDisplayName(db, 'cy', 'Cy')
    expect((await acceptInvite(db, token, 'cy', NOW)).status).toBe('needs-city')
    expect((await acceptInvite(db, token, 'ann', NOW)).status).toBe('own')
    await setDisplayName(db, 'bob', 'Bob')
    expect((await acceptInvite(db, token, 'bob', later(INVITE_TTL_MS))).status).toBe('expired')
    expect((await acceptInvite(db, 'not-a-real-token-at-all-0000', 'bob', NOW)).status).toBe(
      'unknown',
    )
    expect(await db.select().from(correspondences)).toHaveLength(0)
  })

  it('reuses the correspondence two people already share', async () => {
    await settle('bob', 'Bob')
    await acceptInvite(db, (await invited()).token, 'bob', NOW)
    expect((await createInvite(db, ann, bob.email, NOW)).status).toBe('already-writing')

    // A link passed on by hand, accepted by someone Ann already writes with.
    const second = await invited('someone-else@example.com')
    await acceptInvite(db, second.token, 'bob', NOW)
    expect(await db.select().from(correspondences)).toHaveLength(1)
  })
})

describe('the people page', () => {
  it('lists correspondents by chosen name and the invitations still waiting', async () => {
    await settle('bob', 'Bob')
    await acceptInvite(db, (await invited()).token, 'bob', NOW)
    await invited('dana@example.com')

    const mine = await listPeople(db, 'ann', later(DAY))
    expect(mine.people.map((p) => p.name)).toEqual(['Bob'])
    expect(mine.invites.map((i) => i.email)).toEqual(['dana@example.com'])
    expect((await listPeople(db, 'bob', later(DAY))).people.map((p) => p.name)).toEqual(['Ann Lee'])
    // A lapsed invitation is no longer shown, even before the sweep deletes it.
    expect((await listPeople(db, 'ann', later(INVITE_TTL_MS + DAY))).invites).toEqual([])
  })
})

describe('what letters registers', () => {
  beforeEach(() => {
    clearExtensionsForTest()
    registerLettersExtensions()
  })

  it('deletes lapsed invitations and their addresses, and keeps accepted ones', async () => {
    await settle('bob', 'Bob')
    await acceptInvite(db, (await invited()).token, 'bob', NOW)
    await invited('dana@example.com')

    expect(await purgeExpiredInvites(db, later(DAY))).toEqual({ count: 0, truncated: false })
    expect((await purgeExpiredInvites(db, later(INVITE_TTL_MS + DAY))).count).toBe(1)
    const left = await db.select().from(invites)
    expect(left).toHaveLength(1)
    expect(left[0]?.acceptedBy).toBe('bob')
  })

  it('closes the correspondences of a deleted account and withdraws its invitations', async () => {
    await settle('bob', 'Bob')
    await acceptInvite(db, (await invited()).token, 'bob', NOW)
    await invited('dana@example.com')

    const contributor = getAccountContributors().find((c) => c.key === 'letters')!
    expect(await contributor.countForDeletion!(db, 'ann')).toBe(1)
    const statements = contributor.deletionStatements!(db, 'ann') as BatchItem<'sqlite'>[]
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

    expect(await openCorrespondenceBetween(db, 'ann', 'bob')).toBeNull()
    expect((await db.select().from(correspondences))[0]?.closedBy).toBe('ann')
    expect((await db.select().from(invites)).map((i) => i.acceptedBy)).toEqual(['bob'])
    expect(await getDisplayName(db, 'ann')).toBeNull()
    expect((await listPeople(db, 'bob', NOW)).people).toEqual([])
  })
})

describe('the invitation email', () => {
  const brand = { appName: 'Dear Mantel', appUrl: 'https://dearmantel.example' }

  it('names the sender, carries the link and escapes the name', () => {
    const email = inviteEmail(brand, { inviterName: 'Ann Lee', token: 'tok_123' })
    expect(email.subject).toBe(inviteSubject('Ann Lee'))
    expect(email.text).toContain('Ann Lee has invited you to exchange letters on Dear Mantel.')
    expect(email.text).toContain('https://dearmantel.example/invite/tok_123')
    expect(email.html).toContain('href="https://dearmantel.example/invite/tok_123"')

    const hostile = inviteEmail(brand, { inviterName: '<img src=x>', token: 'tok_123' })
    expect(hostile.html).not.toContain('<img src=x>')
  })
})
