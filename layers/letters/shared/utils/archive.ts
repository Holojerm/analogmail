// The copy of their letters a person can keep: one archive per
// correspondence, built in their browser, since only it can read them.

export interface ArchiveEntry {
  id: string
  direction: 'sent' | 'received'
  /** Who wrote a received letter. Null when that account is gone, and for sent ones. */
  from: string | null
  /** 'YYYY-MM-DD', the sender's calendar. */
  postmark: string | null
}

export interface ArchiveShelf {
  correspondenceId: string
  /** The other person, the kept mantel, or the family. Empty when they have gone. */
  name: string
  kind: 'person' | 'mantel' | 'family'
  entries: ArchiveEntry[]
  /** Letters that have arrived and not been opened. Making a copy opens nothing. */
  unopened: number
}

/** The encrypted parts of one letter, for its author or a reader who has opened it. */
export interface ArchiveSealed {
  ciphertext: string
  wrappedKey: string
  hasPhoto: boolean
}

/** A name that is safe in a file path on any system. */
export function fileSafe(text: string): string {
  const cleaned = text
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim()
  return cleaned || 'letter'
}

/** "003 2026-11-20 from Ann Lee": in order, dated, and readable in a file list. */
export function entryFileName(index: number, entry: ArchiveEntry, who: string): string {
  const number = String(index + 1).padStart(3, '0')
  const direction = entry.direction === 'sent' ? 'to' : 'from'
  return fileSafe(`${number} ${entry.postmark ?? 'undated'} ${direction} ${who}`)
}
