// Three people in correspondence, with a letter in the post each way between
// New York and the other two. Imported only by the `.dev.ts` seed route.
//
// The letters carry a placeholder where the ciphertext goes: they exercise
// pickup, transit and release, and cannot be opened.

import { inArray } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { planPosting } from '../../shared/utils/postmark'
import { nextRelease } from '../../shared/utils/release'
import { searchKey } from '../../shared/utils/search-key'
import { releaseStateOf, type PostDb } from '../utils/release-run'

const PEOPLE = [
  {
    email: 'rosa@example.com',
    name: 'Rosa',
    cityName: 'New York',
    country: 'US',
    lat: 40.7128,
    lng: -74.006,
    timeZone: 'America/New_York',
  },
  {
    email: 'sam@example.com',
    name: 'Sam',
    cityName: 'Chicago',
    country: 'US',
    lat: 41.8781,
    lng: -87.6298,
    timeZone: 'America/Chicago',
  },
  {
    email: 'yuki@example.com',
    name: 'Yuki',
    cityName: 'Tokyo',
    country: 'JP',
    lat: 35.6762,
    lng: 139.6503,
    timeZone: 'Asia/Tokyo',
  },
] as const

// [author, recipient] as indexes into PEOPLE.
const LETTERS = [
  [1, 0],
  [2, 0],
  [0, 1],
  [0, 2],
] as const

export async function seedThreePeople(db: PostDb, now: Date): Promise<{ people: number }> {
  const { users, postalProfiles, deliveries, notices, letters } = tables
  const { correspondences, correspondenceMembers, letterKeys } = tables
  const emails = PEOPLE.map((person) => person.email)

  await db
    .insert(users)
    .values(PEOPLE.map(({ email, name }) => ({ email, name })))
    .onConflictDoNothing()
  const rows = await db.select().from(users).where(inArray(users.email, emails))
  const ids = PEOPLE.map((person) => rows.find((row) => row.email === person.email)!.id)

  // Start again from nothing, for these three only.
  const memberships = await db
    .select({ correspondenceId: correspondenceMembers.correspondenceId })
    .from(correspondenceMembers)
    .where(inArray(correspondenceMembers.userId, ids))
  const oldPairs = [...new Set(memberships.map((row) => row.correspondenceId))]
  if (oldPairs.length > 0) {
    const oldLetters = await db
      .select({ id: letters.id })
      .from(letters)
      .where(inArray(letters.correspondenceId, oldPairs))
    const letterIds = oldLetters.map((row) => row.id)
    if (letterIds.length > 0) {
      await db.delete(deliveries).where(inArray(deliveries.letterId, letterIds))
      await db.delete(letterKeys).where(inArray(letterKeys.letterId, letterIds))
      await db.delete(letters).where(inArray(letters.id, letterIds))
    }
    await db
      .delete(correspondenceMembers)
      .where(inArray(correspondenceMembers.correspondenceId, oldPairs))
    await db.delete(correspondences).where(inArray(correspondences.id, oldPairs))
  }
  await db.delete(notices).where(inArray(notices.userId, ids))
  await db.delete(postalProfiles).where(inArray(postalProfiles.userId, ids))

  // The same three places in the city list (their GeoNames ids), so /welcome
  // has something to offer before `bun run cities:import` has been run.
  await db
    .insert(tables.cities)
    .values(
      PEOPLE.map(({ email: _email, name: _name, cityName, ...place }, index) => ({
        id: [5128581, 4887398, 1850147][index]!,
        name: cityName,
        searchName: searchKey(cityName),
        ...place,
      })),
    )
    .onConflictDoNothing()

  const profiles = await db
    .insert(postalProfiles)
    .values(
      PEOPLE.map(({ email: _email, name: _name, ...place }, index) => ({
        userId: ids[index]!,
        ...place,
      })),
    )
    .returning()
  for (const profile of profiles) {
    await db
      .update(postalProfiles)
      .set({ nextReleaseAt: nextRelease(now, releaseStateOf(profile)).at })
      .where(inArray(postalProfiles.userId, [profile.userId]))
  }

  const pairs = new Map<string, string>()
  for (const [a, b] of [
    [0, 1],
    [0, 2],
    [1, 2],
  ] as const) {
    const [pair] = await db.insert(correspondences).values({}).returning()
    pairs.set(`${a}-${b}`, pair!.id)
    await db.insert(correspondenceMembers).values([
      { correspondenceId: pair!.id, userId: ids[a]! },
      { correspondenceId: pair!.id, userId: ids[b]! },
    ])
  }

  for (const [author, recipient] of LETTERS) {
    const from = PEOPLE[author]
    const to = PEOPLE[recipient]
    const posting = planPosting(
      now,
      { zone: from.timeZone, place: from },
      { place: to, mailDays: profiles.find((row) => row.userId === ids[recipient])!.mailDays },
    )
    const [letter] = await db
      .insert(letters)
      .values({
        correspondenceId: pairs.get(
          `${Math.min(author, recipient)}-${Math.max(author, recipient)}`,
        )!,
        authorId: ids[author]!,
        sealedAt: now,
        pickupAt: posting.at,
        postmarkDate: posting.postmark,
        ciphertext: 'dev-seed-placeholder',
      })
      .returning()
    await db.insert(deliveries).values({
      letterId: letter!.id,
      recipientId: ids[recipient]!,
      earliestDate: posting.earliestDate,
      promisedDate: posting.promisedDate,
      transitDays: posting.transitDays,
    })
  }

  return { people: PEOPLE.length }
}
