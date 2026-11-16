// Display names: what a person's correspondents call them.

import { eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import type { ExtensionDb } from '#server/utils/extensions'

export type LettersDb = ExtensionDb

/** The name the person chose, or null if they have not chosen one. */
export async function getDisplayName(db: LettersDb, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ displayName: tables.people.displayName })
    .from(tables.people)
    .where(eq(tables.people.userId, userId))
    .limit(1)
  return row?.displayName ?? null
}

/**
 * Saves the chosen name, and copies it to the account so the app's other mail
 * greets the person by it.
 */
export async function setDisplayName(db: LettersDb, userId: string, name: string): Promise<void> {
  await db.batch([
    db
      .insert(tables.people)
      .values({ userId, displayName: name })
      .onConflictDoUpdate({
        target: tables.people.userId,
        set: { displayName: name, updatedAt: new Date() },
      }),
    db.update(tables.users).set({ name }).where(eq(tables.users.id, userId)),
  ])
}
