// Who a letter is for. Usually a person, with their account key. It can also
// be a kept mantel (a child's, a couple's), which has its own key and its own
// post, and is a member of the correspondence under its own id.

import { inArray } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { chunk, IN_LIST } from '#layers/post/server/utils/chunk'

import type { LettersDb } from './people'

export interface Recipient {
  name: string
  /** SPKI, base64url: the key a letter's key is wrapped to. */
  publicKey: string
  mantel: boolean
}

/**
 * Every id that is a person or an open mantel with a key. A family or a
 * child's news has a list of readers, so this is four queries for each
 * `IN_LIST` of them, not four for each reader.
 */
export async function recipientIdentities(
  db: LettersDb,
  ids: string[],
): Promise<Map<string, Recipient>> {
  const { mantels, people, userKeys, users } = tables
  const found = new Map<string, Recipient>()
  for (const group of chunk(ids, IN_LIST)) {
    const kept = await db
      .select({
        id: mantels.id,
        name: mantels.name,
        publicKey: mantels.publicKey,
        closedAt: mantels.closedAt,
      })
      .from(mantels)
      .where(inArray(mantels.id, group))
    const keys = await db
      .select({ userId: userKeys.userId, publicKey: userKeys.publicKey })
      .from(userKeys)
      .where(inArray(userKeys.userId, group))
    const accounts = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, group))
    const chosen = await db
      .select({ userId: people.userId, displayName: people.displayName })
      .from(people)
      .where(inArray(people.userId, group))

    for (const id of group) {
      const mantel = kept.find((row) => row.id === id)
      if (mantel) {
        if (!mantel.closedAt) {
          found.set(id, { name: mantel.name, publicKey: mantel.publicKey, mantel: true })
        }
        continue
      }
      const key = keys.find((row) => row.userId === id)
      if (!key) continue
      found.set(id, {
        name:
          chosen.find((row) => row.userId === id)?.displayName ??
          accounts.find((row) => row.id === id)?.name ??
          '',
        publicKey: key.publicKey,
        mantel: false,
      })
    }
  }
  return found
}

/** Null when there is no such person or mantel, or they have no key yet. */
export async function recipientIdentity(db: LettersDb, id: string): Promise<Recipient | null> {
  return (await recipientIdentities(db, [id])).get(id) ?? null
}
