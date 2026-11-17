// An invitation link opened before its holder had an account. It is kept in
// this browser until they have signed up, then picked up again. Finishing
// sign-up in another browser loses it here; the server then finds the
// invitation by the address it was sent to (GET /api/letters/invites/mine).

const KEY = 'dearmantel:pending-invite'

export interface PendingInvite {
  token: string
  /** Who sent it, for the line that says what the sign-up steps are for. */
  sender: string | null
  /**
   * The person pressed a button to accept, and only an account stood in the
   * way. Their invitation is then accepted for them once they have one.
   */
  accepting: boolean
}

export function rememberInvite(invite: PendingInvite): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(invite))
  } catch {
    // Without storage the person follows the link from their email again.
  }
}

export function pendingInvite(): PendingInvite | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PendingInvite> | null
    if (typeof kept?.token !== 'string') return null
    return {
      token: kept.token,
      sender: typeof kept.sender === 'string' ? kept.sender : null,
      accepting: kept.accepting === true,
    }
  } catch {
    return null
  }
}

export function forgetInvite(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing was stored.
  }
}
