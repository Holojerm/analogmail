// Who a letter is for. Usually a person, with their account key. It can also
// be a kept mantel (a child's, a couple's), which has its own key and its own
// post, and is a member of the correspondence under its own id.

import { eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { getDisplayName, type LettersDb } from './people'

export interface Recipient {
  name: string
  /** SPKI, base64url: the key a letter's key is wrapped to. */
  publicKey: string
  mantel: boolean
}

/** Null when there is no such person or mantel, or they have no key yet. */
export async function recipientIdentity(db: LettersDb, id: string): Promise<Recipient | null> {
  const { mantels, userKeys, users } = tables
  const [mantel] = await db
    .select({ name: mantels.name, publicKey: mantels.publicKey, closedAt: mantels.closedAt })
    .from(mantels)
    .where(eq(mantels.id, id))
    .limit(1)
  if (mantel) {
    return mantel.closedAt ? null : { name: mantel.name, publicKey: mantel.publicKey, mantel: true }
  }
  const [key] = await db
    .select({ publicKey: userKeys.publicKey })
    .from(userKeys)
    .where(eq(userKeys.userId, id))
    .limit(1)
  if (!key) return null
  const [account] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
  return {
    name: (await getDisplayName(db, id)) ?? account?.name ?? '',
    publicKey: key.publicKey,
    mantel: false,
  }
}
