// Letters to a kept mantel against a real D1: it takes mail under its own id,
// a letter can be sealed until a day, and before that day nobody is served
// its text, its photo or its key, keepers included.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import { clearExtensionsForTest } from '#server/utils/extensions'
import { registerKeysExtensions } from '#layers/keys/server/utils/keys-extensions'
import { clearNoticeAudienceForTest } from '#layers/post/server/utils/notice-audience'
import { runRelease } from '#layers/post/server/utils/release-run'

import { acceptInvite } from '../server/utils/accept-invite'
import { listPeople, openMantelCorrespondence } from '../server/utils/correspondences'
import { ownLetter, saveDraft } from '../server/utils/drafts'
import { inviteEmail } from '../server/utils/invite-email'
import { createInvite, viewInvite } from '../server/utils/invites'
import {
  listKeptMantel,
  listWriters,
  openKeptLetter,
  readKeptPhoto,
} from '../server/utils/kept-mantel'
import { openLetter, listMantel } from '../server/utils/mantel'
import { attachPhoto, type PhotoStore } from '../server/utils/photos'
import { listDesk, planSeal, recallLetter, sealLetter } from '../server/utils/posting'

const db = drizzle(env.DB, { schema })
const {
  users,
  people,
  userKeys,
  postalProfiles,
  notices,
  mantels,
  mantelKeepers,
  correspondences,
  correspondenceMembers,
  letters,
  letterKeys,
  deliveries,
  invites,
} = schema

const store: PhotoStore = {
  async put(key, bytes) {
    await env.BLOB.put(key, bytes)
  },
  async get(key) {
    const found = await env.BLOB.get(key)
    return found ? found.arrayBuffer() : null
  },
  async remove(keys) {
    await env.BLOB.delete(keys)
  },
}

const LEO = 'aaaaaaaa-0000-4000-8000-000000000001'
const MONDAY = new Date('2026-11-16T20:00:00Z')
const FRIDAY = new Date('2026-11-20T18:00:00Z')
const BIRTHDAY = '2044-06-14'
const SEALED = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const OPEN = '9a1d2c3b-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const CIPHERTEXT = `v1.${'A'.repeat(16)}.${'B'.repeat(40)}`
const CHICAGO = {
  cityName: 'Chicago',
  country: 'US',
  lat: 41.85,
  lng: -87.65,
  timeZone: 'America/Chicago',
}

let toLeo = ''

async function write(id: string, opensOn: string | null = null) {
  await saveDraft(
    db,
    'ann',
    { id, correspondenceId: toLeo, ciphertext: CIPHERTEXT, wrappedKey: 'key-for-ann' },
    MONDAY,
  )
  return sealLetter(db, 'ann', id, 'key-for-leo', MONDAY, opensOn)
}
const deliver = () =>
  db
    .update(deliveries)
    .set({ state: 'delivered', deliveredAt: FRIDAY, mailDate: '2026-11-20' })
    .where(eq(deliveries.recipientId, LEO))

beforeEach(async () => {
  clearExtensionsForTest()
  clearNoticeAudienceForTest()
  for (const table of [
    notices,
    deliveries,
    letterKeys,
    letters,
    invites,
    correspondenceMembers,
    correspondences,
    mantelKeepers,
    mantels,
    postalProfiles,
    userKeys,
    people,
  ]) {
    await db.delete(table)
  }
  await db.delete(users)
  for (const id of ['ann', 'bob', 'eve']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
    await db.insert(userKeys).values({ userId: id, publicKey: `public-key-of-${id}` })
    await db.insert(postalProfiles).values({ userId: id, ...CHICAGO })
  }
  await db.insert(people).values([
    { userId: 'ann', displayName: 'Ann Lee' },
    { userId: 'eve', displayName: 'Granny Eve' },
  ])
  await db.insert(mantels).values({ id: LEO, kind: 'child', name: 'Leo', publicKey: 'leo-key' })
  await db.insert(mantelKeepers).values([
    { mantelId: LEO, userId: 'ann', role: 'guardian' },
    { mantelId: LEO, userId: 'bob', role: 'guardian' },
  ])
  // The mantel's own post, under its own id.
  await db.insert(postalProfiles).values({ userId: LEO, ...CHICAGO })
  toLeo = (await openMantelCorrespondence(db, 'ann', LEO, MONDAY))!
})

describe('writing to a kept mantel', () => {
  it('is open to its keepers only, one correspondence each', async () => {
    expect(await openMantelCorrespondence(db, 'eve', LEO, MONDAY)).toBeNull()
    expect(await openMantelCorrespondence(db, 'ann', LEO, MONDAY)).toBe(toLeo)
    expect(await openMantelCorrespondence(db, 'bob', LEO, MONDAY)).not.toBe(toLeo)
    expect((await listPeople(db, 'ann', MONDAY)).people).toMatchObject([{ name: 'Leo' }])
  })

  it('seals to the mantel under its own key and id', async () => {
    expect(await planSeal(db, 'ann', toLeo, MONDAY)).toMatchObject({
      recipientId: LEO,
      recipientName: 'Leo',
      recipientPublicKey: 'leo-key',
      toMantel: true,
    })
    expect((await write(OPEN)).status).toBe('sealed')
    expect(await db.select().from(deliveries)).toMatchObject([{ recipientId: LEO }])
    expect((await listDesk(db, 'ann', MONDAY)).letters).toMatchObject([{ to: 'Leo' }])
  })

  it('can be sealed until a later day, within a lifetime', async () => {
    expect((await write(SEALED, '2026-11-16')).status).toBe('cannot-seal-until')
    expect((await write(SEALED, '2200-01-01')).status).toBe('cannot-seal-until')
    expect((await write(SEALED, BIRTHDAY)).status).toBe('sealed')
    expect((await listDesk(db, 'ann', MONDAY)).letters[0]).toMatchObject({ opensOn: BIRTHDAY })
  })

  it('forgets the day when the letter is recalled', async () => {
    await write(SEALED, BIRTHDAY)
    expect(await recallLetter(db, 'ann', SEALED, MONDAY)).toBe('recalled')
    expect((await db.select().from(letters))[0]?.opensOn).toBeNull()
  })

  it('does not let a letter to a person be sealed until a day', async () => {
    await db.insert(correspondences).values({ id: 'pair' })
    await db.insert(correspondenceMembers).values([
      { correspondenceId: 'pair', userId: 'ann' },
      { correspondenceId: 'pair', userId: 'bob' },
    ])
    await saveDraft(
      db,
      'ann',
      { id: OPEN, correspondenceId: 'pair', ciphertext: CIPHERTEXT, wrappedKey: 'key-for-ann' },
      MONDAY,
    )
    expect((await sealLetter(db, 'ann', OPEN, 'key-for-bob', MONDAY, BIRTHDAY)).status).toBe(
      'cannot-seal-until',
    )
  })
})

describe('what arrives', () => {
  beforeEach(async () => {
    await write(OPEN)
    await write(SEALED, BIRTHDAY)
  })

  it('shows nothing before delivery', async () => {
    expect(await listKeptMantel(db, 'bob', LEO, FRIDAY)).toEqual([])
    expect(await openKeptLetter(db, 'bob', LEO, OPEN, FRIDAY)).toBeNull()
  })

  it('is listed for keepers only, a sealed letter with its day and nothing more', async () => {
    await deliver()
    expect(await listKeptMantel(db, 'eve', LEO, FRIDAY)).toBeNull()
    const items = (await listKeptMantel(db, 'bob', LEO, FRIDAY))!
    expect(items.find((item) => item.letterId === OPEN)).toMatchObject({
      name: 'Ann Lee',
      sealed: false,
      opensOn: null,
      opened: false,
    })
    expect(items.find((item) => item.letterId === SEALED)).toMatchObject({
      sealed: true,
      opensOn: BIRTHDAY,
    })
  })

  it('opens an unsealed letter with the mantel copy of its key, once marked', async () => {
    await deliver()
    expect(await openKeptLetter(db, 'eve', LEO, OPEN, FRIDAY)).toBeNull()
    expect(await openKeptLetter(db, 'bob', LEO, OPEN, FRIDAY)).toMatchObject({
      sealed: false,
      ciphertext: CIPHERTEXT,
      wrappedKey: 'key-for-leo',
    })
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.letterId, OPEN))
    expect(delivery?.openedAt).toEqual(FRIDAY)
  })

  it('gives a keeper nothing of a sealed letter before its day', async () => {
    await deliver()
    await db.update(letters).set({ photoKey: 'letters/x/y' }).where(eq(letters.id, SEALED))
    await env.BLOB.put('letters/x/y', new Uint8Array(40))

    for (const keeper of ['ann', 'bob']) {
      const sealed = await openKeptLetter(db, keeper, LEO, SEALED, FRIDAY)
      expect(sealed).toEqual({
        sealed: true,
        letterId: SEALED,
        postmark: '2026-11-16',
        opensOn: BIRTHDAY,
      })
      expect(await readKeptPhoto(db, store, keeper, LEO, SEALED, FRIDAY)).toBeNull()
    }
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.letterId, SEALED))
    expect(delivery?.openedAt).toBeNull()
    // The day before, on the mantel's own calendar: 13 June in Chicago.
    const eve = new Date('2044-06-14T04:00:00Z')
    expect(await openKeptLetter(db, 'bob', LEO, SEALED, eve)).toMatchObject({ sealed: true })
  })

  it('opens from the day itself, any day of the week', async () => {
    await deliver()
    const theDay = new Date('2044-06-14T06:00:00Z')
    expect(await openKeptLetter(db, 'bob', LEO, SEALED, theDay)).toMatchObject({
      sealed: false,
      wrappedKey: 'key-for-leo',
    })
  })

  it("leaves the writer their own copy, and puts nothing on any person's mantel", async () => {
    await deliver()
    expect(await ownLetter(db, 'ann', SEALED)).toMatchObject({ wrappedKey: 'key-for-ann' })
    expect(await listMantel(db, 'ann')).toEqual([])
    expect(await listMantel(db, 'bob')).toEqual([])
    expect(await openLetter(db, 'bob', SEALED, FRIDAY)).toBeNull()
  })
})

describe('the release', () => {
  it('delivers to the mantel on its own mail day and tells its keepers, not the mantel', async () => {
    registerKeysExtensions()
    await write(OPEN)
    for (let day = 17; day <= 25; day += 1) {
      await runRelease(db, new Date(`2026-11-${day}T16:30:00Z`))
    }

    const [delivery] = await db.select().from(deliveries)
    expect(delivery).toMatchObject({ recipientId: LEO, state: 'delivered' })
    const told = (await db.select().from(notices)).map((row) => row.userId).toSorted()
    expect(told).toEqual(['ann', 'bob'])
  })
})

describe('a photo on a kept mantel', () => {
  it('is served to keepers once the letter has arrived and is not sealed', async () => {
    await saveDraft(
      db,
      'ann',
      { id: OPEN, correspondenceId: toLeo, ciphertext: CIPHERTEXT, wrappedKey: 'key-for-ann' },
      MONDAY,
    )
    await attachPhoto(
      db,
      store,
      'ann',
      { letterId: OPEN, photoId: SEALED, bytes: new Uint8Array(64).fill(7) },
      MONDAY,
    )
    await sealLetter(db, 'ann', OPEN, 'key-for-leo', MONDAY)

    expect(await readKeptPhoto(db, store, 'bob', LEO, OPEN, FRIDAY)).toBeNull()
    await deliver()
    expect(await readKeptPhoto(db, store, 'eve', LEO, OPEN, FRIDAY)).toBeNull()
    const file = await readKeptPhoto(db, store, 'bob', LEO, OPEN, FRIDAY)
    expect(file && new Uint8Array(file)[0]).toBe(7)
  })
})

describe('inviting a writer', () => {
  const ann = { id: 'ann', email: 'ann@example.com' }

  it('is for keepers, and the invitation names the mantel', async () => {
    expect(
      await createInvite(db, { id: 'eve', email: 'eve@example.com' }, 'x@example.com', MONDAY, LEO),
    ).toEqual({ status: 'not-keeper' })

    const invite = await createInvite(db, ann, 'eve@example.com', MONDAY, LEO)
    if (invite.status !== 'created') throw new Error(invite.status)
    expect(invite.mantelName).toBe('Leo')
    expect(await viewInvite(db, invite.token, MONDAY)).toMatchObject({
      status: 'open',
      inviterName: 'Ann Lee',
      mantelName: 'Leo',
    })
    // A keeper may also invite the same person to write to themself.
    expect((await createInvite(db, ann, 'eve@example.com', MONDAY)).status).toBe('created')
    expect((await createInvite(db, ann, 'eve@example.com', MONDAY, LEO)).status).toBe('pending')
  })

  it('makes a correspondence with the mantel, not with the keeper', async () => {
    const invite = await createInvite(db, ann, 'eve@example.com', MONDAY, LEO)
    if (invite.status !== 'created') throw new Error(invite.status)
    const accepted = await acceptInvite(db, invite.token, 'eve', MONDAY)
    if (accepted.status !== 'accepted') throw new Error(accepted.status)

    expect((await listPeople(db, 'eve', MONDAY)).people).toMatchObject([{ name: 'Leo' }])
    expect((await listPeople(db, 'ann', MONDAY)).people.map((person) => person.name)).toEqual([
      'Leo',
    ])
    expect(await planSeal(db, 'eve', accepted.correspondenceId, MONDAY)).toMatchObject({
      recipientId: LEO,
      toMantel: true,
    })
    expect((await createInvite(db, ann, 'eve@example.com', MONDAY, LEO)).status).toBe(
      'already-writing',
    )
  })

  it('lets a writer write and seal, and read nothing on the mantel', async () => {
    const invite = await createInvite(db, ann, 'eve@example.com', MONDAY, LEO)
    if (invite.status !== 'created') throw new Error(invite.status)
    const accepted = await acceptInvite(db, invite.token, 'eve', MONDAY)
    if (accepted.status !== 'accepted') throw new Error(accepted.status)
    await saveDraft(
      db,
      'eve',
      {
        id: OPEN,
        correspondenceId: accepted.correspondenceId,
        ciphertext: CIPHERTEXT,
        wrappedKey: 'key-for-eve',
      },
      MONDAY,
    )
    expect((await sealLetter(db, 'eve', OPEN, 'key-for-leo', MONDAY, BIRTHDAY)).status).toBe(
      'sealed',
    )
    await deliver()

    expect(await listKeptMantel(db, 'eve', LEO, FRIDAY)).toBeNull()
    expect(await openKeptLetter(db, 'eve', LEO, OPEN, FRIDAY)).toBeNull()
    expect((await listKeptMantel(db, 'bob', LEO, FRIDAY))![0]).toMatchObject({
      name: 'Granny Eve',
      sealed: true,
    })
  })

  it('shows keepers who writes and who has been asked', async () => {
    const asked = await createInvite(db, ann, 'new@example.com', MONDAY, LEO)
    if (asked.status !== 'created') throw new Error(asked.status)
    const invite = await createInvite(db, ann, 'eve@example.com', MONDAY, LEO)
    if (invite.status !== 'created') throw new Error(invite.status)
    await acceptInvite(db, invite.token, 'eve', MONDAY)

    expect(await listWriters(db, 'eve', LEO, MONDAY)).toBeNull()
    const view = (await listWriters(db, 'bob', LEO, MONDAY))!
    expect(view.writers.map((writer) => writer.name).toSorted()).toEqual(['Ann Lee', 'Granny Eve'])
    expect(view.invited).toMatchObject([{ email: 'new@example.com' }])
  })

  it('sends its own email, which uses the mantel name only if it is safe to print', () => {
    const brand = { appName: 'Dear Mantel', appUrl: 'https://dearmantel.com' }
    const mail = inviteEmail(brand, { inviterName: 'Ann Lee', token: 'tok', mantelName: 'Leo' })
    expect(mail.subject).toBe('Ann Lee asks you to write to Leo')
    expect(mail.text).toContain('keeps a mantel for Leo')
    expect(mail.text).toContain('/invite/tok')

    const odd = inviteEmail(brand, {
      inviterName: 'Ann Lee',
      token: 'tok',
      mantelName: 'visit evil.example now',
    })
    expect(odd.subject).toBe('Ann Lee asks you to write to someone dear to them')
    expect(odd.html).not.toContain('evil.example')
  })
})
