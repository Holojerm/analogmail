// An invitation link opened before its holder had an account. The link is
// kept in this browser until they have signed up, then picked up again.

const KEY = 'dearmantel:pending-invite'

export function rememberInvite(token: string): void {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    // Without storage the person follows the link from their email again.
  }
}

export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(KEY)
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
