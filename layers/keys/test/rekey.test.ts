// Changing a mantel's key against a real D1: it is asked for when a keeper
// leaves, it replaces every copy at once or nothing, the keepers who remain
// are handed the new key, and a copy of an old key can never be stored as the
// current one, whichever route it arrives by.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import { clearExtensionsForTest, getAccountContributors } from '#server/utils/extensions'
import { sha256Hex } from '#server/utils/hash'

import { isGuardFailure } from '../server/utils/batch-guard'
import {
  acceptSeat,
  grantSeat,
  proposeKeeper,
  proposeRemoval,
  voteForProposal,
} from '../server/utils/custody'
import { registerKeysExtensions } from '../server/utils/keys-extensions'
import { createMantel, getMantel, keepersOf } from '../server/utils/mantels'
import { claimRecovery, findByRecoveryProof, finishRecovery } from '../server/utils/recovery'
import { rekeyPlan, rekeySchema, rekeyStatements, settleHandover } from '../server/utils/rekey'
import { HANDOVER_SEPARATOR, RECOVERY_WAIT_DAYS } from '../shared/utils/mantel-format'

const db = drizzle(env.DB, { schema })
const {
  users,
  userKeys,
  mantels,
  mantelKeepers,
  mantelKeyWraps,
  mantelProposals,
  mantelVotes,
  mantelRecoveries,
  batchGuards,
} = schema

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]

const NOW = new Date('2026-11-16T12:00:00Z')
const LATER = new Date('2026-11-17T12:00:00Z')
const MANTEL = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const OLD_KEY = 'A'.repeat(122)
const NEW_KEY = 'B'.repeat(122)
const OLD_PROOF = 'p'.repeat(43)
const NEW_PROOF = 'q'.repeat(43)
const keeperWrap = (who: string) => `v1.${'P'.repeat(87)}.${'I'.repeat(16)}.${who.padEnd(160, 'W')}`
const recoveryWrap = (fill: string) => `v1.${'I'.repeat(16)}.${fill.repeat(160)}`

const wrapsOf = async () =>
  (await db.select().from(mantelKeyWraps)).map((row) => `${row.kind}:${row.keeperId}`).toSorted()
const mantel = async () => (await db.select().from(mantels).where(eq(mantels.id, MANTEL)))[0]!

async function seat(who: string, voters: string[] = []) {
  const offer = await proposeKeeper(
    db,
    'ann',
    { mantelId: MANTEL, email: `${who}@example.com`, role: 'guardian' },
    NOW,
  )
  if (offer.result !== 'proposed') throw new Error(offer.result)
  for (const voter of voters) await voteForProposal(db, voter, offer.proposalId, NOW)
  await acceptSeat(db, who, offer.proposalId, NOW)
  const { keyVersion } = await mantel()
  return grantSeat(db, 'ann', offer.proposalId, { wrapped: keeperWrap(who), keyVersion }, NOW)
}

/** Cal stops keeping the mantel: Ann proposes it and Bob agrees. */
async function calLeaves() {
  const removal = await proposeRemoval(db, 'ann', { mantelId: MANTEL, keeperId: 'cal' }, NOW)
  if (removal.result !== 'proposed') throw new Error(removal.result)
  await voteForProposal(db, 'bob', removal.proposalId, NOW)
}

/** What Ann's browser sends after making a new key. */
const input = async (over: Partial<Parameters<typeof rekeyStatements>[2]> = {}) => ({
  mantelId: MANTEL,
  keyVersion: 1,
  publicKey: NEW_KEY,
  keeperWrap: keeperWrap('ann-new'),
  recoveryWrap: recoveryWrap('N'),
  recoveryProofHash: await sha256Hex(NEW_PROOF),
  handovers: { bob: keeperWrap('bob-handover') },
  ...over,
})

async function rekey(over: Partial<Parameters<typeof rekeyStatements>[2]> = {}, who = 'ann') {
  const ready = await rekeyStatements(db, who, await input(over), LATER)
  if (ready.status !== 'ready') return ready.status
  await db.batch(ready.statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return 'rekeyed'
}

beforeEach(async () => {
  clearExtensionsForTest()
  for (const table of [
    mantelRecoveries,
    mantelVotes,
    mantelProposals,
    mantelKeyWraps,
    mantelKeepers,
    mantels,
    userKeys,
  ]) {
    await db.delete(table)
  }
  await db.delete(users)
  for (const id of ['ann', 'bob', 'cal', 'eve']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
    await db.insert(userKeys).values({ userId: id, publicKey: `key-of-${id}` })
  }
  await createMantel(
    db,
    'ann',
    {
      id: MANTEL,
      kind: 'child',
      name: 'Leo',
      publicKey: OLD_KEY,
      keeperWrap: keeperWrap('ann'),
      recoveryWrap: recoveryWrap('R'),
      recoveryProofHash: await sha256Hex(OLD_PROOF),
    },
    NOW,
  )
  expect(await seat('bob')).toBe('seated')
  expect(await seat('cal', ['bob'])).toBe('seated')
})

describe('when a keeper leaves', () => {
  it('asks for nothing while every keeper is still there', async () => {
    expect(await getMantel(db, 'ann', MANTEL)).toMatchObject({ rekeyDue: false, keyVersion: 1 })
    expect(await rekeyPlan(db, 'ann', MANTEL)).toBeNull()
    expect(await rekey()).toBe('not-due')
  })

  it('asks the keepers who remain to change the key, by a vote', async () => {
    await calLeaves()
    expect(await wrapsOf()).toEqual(['keeper:ann', 'keeper:bob', 'recovery:'])
    for (const keeper of ['ann', 'bob']) {
      expect(await getMantel(db, keeper, MANTEL)).toMatchObject({ rekeyDue: true })
    }
  })

  it('asks the same when they delete their account', async () => {
    registerKeysExtensions()
    const contributor = getAccountContributors().find((c) => c.key === 'keys')!
    const statements = contributor.deletionStatements!(db, 'cal') as BatchItem<'sqlite'>[]
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
    expect((await keepersOf(db, MANTEL)).map((row) => row.userId).toSorted()).toEqual([
      'ann',
      'bob',
    ])
    expect(await getMantel(db, 'ann', MANTEL)).toMatchObject({ rekeyDue: true })
  })
})

describe('the plan for a re-key', () => {
  beforeEach(calLeaves)

  it('names the key to be holding and the keepers to hand the new one to', async () => {
    expect(await rekeyPlan(db, 'ann', MANTEL)).toEqual({
      keyVersion: 1,
      publicKey: OLD_KEY,
      others: [{ userId: 'bob', publicKey: 'key-of-bob' }],
    })
  })

  it('is for keepers only, and not for the one who left', async () => {
    expect(await rekeyPlan(db, 'cal', MANTEL)).toBeNull()
    expect(await rekeyPlan(db, 'eve', MANTEL)).toBeNull()
    expect(await rekey({}, 'cal')).toBe('not-keeper')
  })
})

describe('changing the key', () => {
  beforeEach(calLeaves)

  it('takes what a browser sends, and nothing shaped otherwise', async () => {
    expect(rekeySchema.safeParse(await input()).success).toBe(true)
    expect(rekeySchema.safeParse(await input({ publicKey: 'short' })).success).toBe(false)
    expect(rekeySchema.safeParse(await input({ handovers: { bob: 'not-a-wrap' } })).success).toBe(
      false,
    )
  })

  it('replaces the key, every copy and the recovery code at once', async () => {
    expect(await rekey()).toBe('rekeyed')

    expect(await mantel()).toMatchObject({
      publicKey: NEW_KEY,
      keyVersion: 2,
      rekeyDueAt: null,
      recoveryProofHash: await sha256Hex(NEW_PROOF),
    })
    expect(await wrapsOf()).toEqual(['handover:bob', 'keeper:ann', 'previous:bob', 'recovery:'])
    expect(await getMantel(db, 'ann', MANTEL)).toMatchObject({
      wrappedKey: keeperWrap('ann-new'),
      handover: null,
      rekeyDue: false,
    })
    // Nobody who still keeps the mantel is shut out.
    expect(await getMantel(db, 'bob', MANTEL)).toMatchObject({
      wrappedKey: null,
      handover: { previous: keeperWrap('bob'), wrapped: keeperWrap('bob-handover') },
    })
    expect(await findByRecoveryProof(db, OLD_PROOF)).toBeNull()
    expect(await findByRecoveryProof(db, NEW_PROOF)).toMatchObject({
      recoveryWrap: recoveryWrap('N'),
    })
    expect(await db.select().from(batchGuards)).toEqual([])
  })

  it('is refused when it was worked out from an earlier key', async () => {
    expect(await rekey({ keyVersion: 2 })).toBe('changed')
    expect(await rekey()).toBe('rekeyed')
    expect(await rekey({ publicKey: 'C'.repeat(122) })).toBe('not-due')
  })

  it('must hand the new key to exactly the keepers who hold the old one', async () => {
    expect(await rekey({ handovers: {} })).toBe('keepers-changed')
    expect(await rekey({ handovers: { bob: keeperWrap('b'), cal: keeperWrap('c') } })).toBe(
      'keepers-changed',
    )
    expect(await rekey({ handovers: { cal: keeperWrap('c') } })).toBe('keepers-changed')
    expect((await mantel()).publicKey).toBe(OLD_KEY)
  })

  it('stores nothing if another keeper got there first', async () => {
    const mine = await rekeyStatements(db, 'ann', await input(), LATER)
    const theirs = await rekeyStatements(
      db,
      'bob',
      await input({
        publicKey: 'C'.repeat(122),
        keeperWrap: keeperWrap('bob-new'),
        handovers: { ann: keeperWrap('ann-handover') },
      }),
      LATER,
    )
    if (mine.status !== 'ready' || theirs.status !== 'ready') throw new Error('not ready')
    await db.batch(theirs.statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

    const failure = await db
      .batch(mine.statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(isGuardFailure(failure)).toBe(true)
    expect(await mantel()).toMatchObject({ publicKey: 'C'.repeat(122), keyVersion: 2 })
    expect(await wrapsOf()).toEqual(['handover:ann', 'keeper:bob', 'previous:ann', 'recovery:'])
  })

  it('stores nothing if a keeper was seated while the browser worked', async () => {
    const ready = await rekeyStatements(db, 'ann', await input(), LATER)
    if (ready.status !== 'ready') throw new Error(ready.status)
    expect(await seat('eve', ['bob'])).toBe('seated')

    const failure = await db
      .batch(ready.statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(isGuardFailure(failure)).toBe(true)
    expect((await mantel()).publicKey).toBe(OLD_KEY)
    expect(await wrapsOf()).toEqual(['keeper:ann', 'keeper:bob', 'keeper:eve', 'recovery:'])
  })

  it('is refused when the "new" key is the one the mantel already has', async () => {
    expect(await rekey({ publicKey: OLD_KEY })).toBe('changed')
    expect(await getMantel(db, 'ann', MANTEL)).toMatchObject({ rekeyDue: true, keyVersion: 1 })
  })

  it('stores nothing if the keepers changed places while the browser worked', async () => {
    const ready = await rekeyStatements(db, 'ann', await input(), LATER)
    if (ready.status !== 'ready') throw new Error(ready.status)
    // Bob goes and Eve comes: as many copies as before, held by other people.
    await db.update(mantelKeepers).set({ leftAt: LATER }).where(eq(mantelKeepers.userId, 'bob'))
    await db.delete(mantelKeyWraps).where(eq(mantelKeyWraps.keeperId, 'bob'))
    await db.insert(mantelKeepers).values({ mantelId: MANTEL, userId: 'eve', role: 'guardian' })
    await db
      .insert(mantelKeyWraps)
      .values({ mantelId: MANTEL, kind: 'keeper', keeperId: 'eve', wrapped: keeperWrap('eve') })

    const failure = await db.batch(ready.statements as Batch).then(
      () => null,
      (error: unknown) => error,
    )
    expect(isGuardFailure(failure)).toBe(true)
    expect((await mantel()).publicKey).toBe(OLD_KEY)
    expect(await wrapsOf()).toEqual(['keeper:ann', 'keeper:eve', 'recovery:'])
  })

  it('is not blocked by a copy left behind for someone who no longer keeps it', async () => {
    await db
      .insert(mantelKeyWraps)
      .values({ mantelId: MANTEL, kind: 'keeper', keeperId: 'cal', wrapped: keeperWrap('cal') })
    expect(await rekey()).toBe('rekeyed')
    expect(await wrapsOf()).toEqual(['handover:bob', 'keeper:ann', 'previous:bob', 'recovery:'])
  })

  it('hands the new key to more keepers than one statement could carry', async () => {
    const many = Array.from({ length: 15 }, (_, n) => `keeper-${n}`)
    for (const id of many) {
      await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
      await db.insert(userKeys).values({ userId: id, publicKey: `key-of-${id}` })
      await db.insert(mantelKeepers).values({ mantelId: MANTEL, userId: id, role: 'successor' })
      await db
        .insert(mantelKeyWraps)
        .values({ mantelId: MANTEL, kind: 'keeper', keeperId: id, wrapped: keeperWrap(id) })
    }
    const handovers = Object.fromEntries(
      ['bob', ...many].map((id) => [id, keeperWrap(`${id}-handover`)]),
    )
    expect(await rekey({ handovers })).toBe('rekeyed')
    expect((await wrapsOf()).filter((wrap) => wrap.startsWith('handover:'))).toHaveLength(16)
  })

  it('tells a guard failure from any other fault', () => {
    expect(isGuardFailure(new Error('D1_ERROR: no such table: mantels'))).toBe(false)
    expect(isGuardFailure(null)).toBe(false)
  })
})

describe('a keeper who was away for more than one re-key', () => {
  const again = { keyVersion: 2, publicKey: 'C'.repeat(122), keeperWrap: keeperWrap('ann-3') }

  beforeEach(async () => {
    await calLeaves()
    expect(await rekey()).toBe('rekeyed')
    // Someone else leaves before Bob has opened the mantel again.
    await db.update(mantels).set({ rekeyDueAt: LATER })
  })

  it('is still handed the new key, as one more link on what they already hold', async () => {
    expect(await rekeyPlan(db, 'ann', MANTEL)).toMatchObject({
      keyVersion: 2,
      others: [{ userId: 'bob', publicKey: 'key-of-bob' }],
    })
    expect(await rekey({ ...again, handovers: {} })).toBe('keepers-changed')
    expect(await rekey({ ...again, handovers: { bob: keeperWrap('bob-second') } })).toBe('rekeyed')

    expect(await wrapsOf()).toEqual(['handover:bob', 'keeper:ann', 'previous:bob', 'recovery:'])
    expect(await getMantel(db, 'bob', MANTEL)).toMatchObject({
      keyVersion: 3,
      wrappedKey: null,
      handover: {
        // His own copy from before either re-key opens the first link.
        previous: keeperWrap('bob'),
        wrapped: `${keeperWrap('bob-handover')}${HANDOVER_SEPARATOR}${keeperWrap('bob-second')}`,
      },
    })
    expect(
      await settleHandover(
        db,
        'bob',
        { mantelId: MANTEL, keyVersion: 3, wrapped: keeperWrap('bob-new') },
        LATER,
      ),
    ).toBe('settled')
    expect(await wrapsOf()).toEqual(['keeper:ann', 'keeper:bob', 'recovery:'])
  })

  it('can do the next re-key themselves once they have opened it', async () => {
    await settleHandover(
      db,
      'bob',
      { mantelId: MANTEL, keyVersion: 2, wrapped: keeperWrap('bob-new') },
      LATER,
    )
    expect(await rekey({ ...again, handovers: { ann: keeperWrap('ann-handover') } }, 'bob')).toBe(
      'rekeyed',
    )
    expect(await wrapsOf()).toEqual(['handover:ann', 'keeper:bob', 'previous:ann', 'recovery:'])
  })
})

describe('the recovery code as the key changes', () => {
  beforeEach(calLeaves)

  /** A database whose next batch runs only after something else has happened. */
  const after = (first: () => Promise<unknown>) =>
    new Proxy(db, {
      get(target, property) {
        if (property === 'batch') {
          return async (statements: Parameters<typeof db.batch>[0]) => {
            await first()
            return target.batch(statements)
          }
        }
        const value = Reflect.get(target, property) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })

  it('does not start a claim with the old code once the key has changed', async () => {
    const claimed = await claimRecovery(
      after(() => rekey()),
      'eve',
      { proof: OLD_PROOF, wrapped: keeperWrap('eve-old') },
      NOW,
    )
    expect(claimed).toEqual({ status: 'unknown' })
    expect(await db.select().from(mantelRecoveries)).toHaveLength(0)
  })

  it('does not restore a copy for someone removed as they used it', async () => {
    const restored = await claimRecovery(
      after(() =>
        db.update(mantelKeepers).set({ leftAt: LATER }).where(eq(mantelKeepers.userId, 'bob')),
      ),
      'bob',
      { proof: OLD_PROOF, wrapped: keeperWrap('bob-again') },
      NOW,
    )
    expect(restored).toEqual({ status: 'unknown' })
    expect(await getMantel(db, 'ann', MANTEL)).toMatchObject({ rekeyDue: true })
    expect((await db.select().from(mantelKeyWraps)).map((row) => row.wrapped)).not.toContain(
      keeperWrap('bob-again'),
    )
  })
})

describe('after the key has changed', () => {
  beforeEach(async () => {
    await calLeaves()
  })

  it("a keeper's browser swaps the handed-over key for an ordinary copy, once", async () => {
    await rekey()
    const settle = (keyVersion: number) =>
      settleHandover(
        db,
        'bob',
        { mantelId: MANTEL, keyVersion, wrapped: keeperWrap('bob-new') },
        LATER,
      )
    expect(await settle(1)).toBe('gone')
    expect(await settle(2)).toBe('settled')
    expect(await wrapsOf()).toEqual(['keeper:ann', 'keeper:bob', 'recovery:'])
    expect(await getMantel(db, 'bob', MANTEL)).toMatchObject({
      wrappedKey: keeperWrap('bob-new'),
      handover: null,
    })
    expect(await settle(2)).toBe('gone')
    expect(
      await settleHandover(
        db,
        'cal',
        { mantelId: MANTEL, keyVersion: 2, wrapped: keeperWrap('cal') },
        LATER,
      ),
    ).toBe('gone')
  })

  it('a copy of the old key cannot seat a new keeper', async () => {
    const offer = await proposeKeeper(
      db,
      'ann',
      { mantelId: MANTEL, email: 'eve@example.com', role: 'guardian' },
      NOW,
    )
    if (offer.result !== 'proposed') throw new Error(offer.result)
    await voteForProposal(db, 'bob', offer.proposalId, NOW)
    await acceptSeat(db, 'eve', offer.proposalId, NOW)
    await rekey()

    const grant = (keyVersion: number) =>
      grantSeat(db, 'ann', offer.proposalId, { wrapped: keeperWrap('eve'), keyVersion }, LATER)
    expect(await grant(1)).toBe('not-ready')
    expect(await wrapsOf()).not.toContain('keeper:eve')
    expect(await grant(2)).toBe('seated')
  })

  it('the old recovery code restores nobody, and a claim made with it is void', async () => {
    const claimed = await claimRecovery(
      db,
      'eve',
      { proof: OLD_PROOF, wrapped: keeperWrap('eve-old') },
      NOW,
    )
    expect(claimed.status).toBe('waiting')
    const [waiting] = await db.select().from(mantelRecoveries)
    await rekey()

    expect(
      await claimRecovery(db, 'bob', { proof: OLD_PROOF, wrapped: keeperWrap('bob-old') }, LATER),
    ).toEqual({ status: 'unknown' })
    const afterWait = new Date(NOW.getTime() + (RECOVERY_WAIT_DAYS + 1) * 86_400_000)
    expect(await finishRecovery(db, 'eve', waiting!.id, afterWait)).toBe('gone')
    expect(await wrapsOf()).not.toContain('keeper:eve')
  })

  it('the new recovery code gives a keeper the new key at once', async () => {
    await rekey()
    expect(
      await claimRecovery(db, 'bob', { proof: NEW_PROOF, wrapped: keeperWrap('bob-new') }, LATER),
    ).toEqual({ status: 'restored', mantelId: MANTEL })
    expect(await wrapsOf()).toEqual(['keeper:ann', 'keeper:bob', 'recovery:'])
  })
})
