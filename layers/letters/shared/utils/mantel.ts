// What a person's mantel shows. Only they ever receive these.

export interface MantelItem {
  letterId: string
  correspondenceId: string
  /** 'letter' arrived for them; 'return' is their own letter come back. */
  kind: 'letter' | 'return'
  /** Who wrote it, or for a return who it was for. Null when that account is gone. */
  name: string | null
  /** 'YYYY-MM-DD', the sender's calendar. */
  postmark: string | null
  /** The mail day it arrived on, 'YYYY-MM-DD'. */
  arrivedOn: string | null
  opened: boolean
}

export interface OpenedLetter {
  letterId: string
  correspondenceId: string
  kind: 'letter' | 'return'
  name: string | null
  postmark: string | null
  ciphertext: string
  wrappedKey: string
  inReplyTo: string | null
  /** Whether the correspondence is still open, so a reply can be written. */
  canReply: boolean
}
