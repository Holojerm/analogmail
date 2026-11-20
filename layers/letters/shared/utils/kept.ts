// What a keeper sees of a kept mantel's letters.

export interface KeptItem {
  letterId: string
  /** Who wrote it. Null when that account is gone. */
  name: string | null
  /** 'YYYY-MM-DD', the sender's calendar. */
  postmark: string | null
  arrivedOn: string | null
  opened: boolean
  /** The day it is sealed until, if it is sealed. */
  opensOn: string | null
  /** Whether that day has not come yet on the mantel's calendar. */
  sealed: boolean
  /** Written from a write link by someone without an account. */
  guest: boolean
}

export type KeptLetter =
  | { sealed: true; letterId: string; postmark: string | null; opensOn: string }
  | {
      sealed: false
      letterId: string
      name: string | null
      postmark: string | null
      ciphertext: string
      /** The letter's key, wrapped to the mantel's public key. */
      wrappedKey: string
      hasPhoto: boolean
      /** Written from a write link. A keeper may take such a letter off the mantel. */
      guest: boolean
      /** The correspondence a child's mantel can write back in, or null. */
      answerIn: string | null
    }

/** Where and when a kept mantel's post arrives, as its keepers see it. */
export interface KeptPost {
  city: string
  country: string
  /** A mask of Monday to Saturday (post layer, mail-days.ts). */
  mailDays: number
  deliveryHour: number
  /** A change to days and hour that is waiting, and the day it starts. */
  pendingMailDays: number | null
  pendingDeliveryHour: number | null
  pendingFrom: string | null
}
