// A channel that can tell someone the flag is up.
//
// The notice has no content to pass: it says that mail has arrived and
// nothing else, so each channel owns its fixed wording and `notify` takes
// only who to tell. That is what lets the same interface fit the channels
// that are not built yet:
//
// - WhatsApp: outside the 24-hour window only a pre-approved template message
//   may be sent, which a fixed notice is.
// - Telegram, Discord: a bot cannot message first. `address` is the chat the
//   person opened through a one-time opt-in link.
// - SMS: needs US sender registration before the first message.

export interface Notice {
  userId: string
  /** Where this channel reaches the person: an email address, a chat id. */
  address: string
}

export type NotifyResult =
  | { ok: true }
  /** `retry` is false when trying again cannot help (the address was refused). */
  | { ok: false; retry: boolean; reason: string }

export interface Notifier {
  /** Matches `notices.channel`. */
  readonly channel: string
  /** False when the channel cannot send at all yet (no provider configured). */
  ready(): boolean
  /** Never throws. A queued send counts as sent. */
  notify(notice: Notice): Promise<NotifyResult>
}
