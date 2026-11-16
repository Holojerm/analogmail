// Who is told that mail arrived. A person is told themself. A mantel that is
// kept for someone else (its id is not a person's) has keepers, who are told
// in its place. The post office does not know about keepers, so whoever does
// registers a resolver here.

import type { PostDb } from './release-run'

/** For each recipient id that is not a person: the people to tell instead. */
export type NoticeAudience = (db: PostDb, recipientIds: string[]) => Promise<Map<string, string[]>>

let resolver: NoticeAudience | null = null

export const registerNoticeAudience = (audience: NoticeAudience): void => {
  resolver = audience
}
export const clearNoticeAudienceForTest = (): void => {
  resolver = null
}

export async function noticeAudience(
  db: PostDb,
  recipientIds: string[],
): Promise<Map<string, string[]>> {
  return resolver && recipientIds.length > 0 ? resolver(db, recipientIds) : new Map()
}
