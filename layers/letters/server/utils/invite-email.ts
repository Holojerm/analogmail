// The invitation email: emails/templates/invite.vue. Fixed wording. It names
// the sender and carries the link, and nothing the sender wrote.

import { composeEmail, type Branding, type EmailContent } from '#server/utils/email-templates'

import { INVITE_TTL_DAYS, mailableMantelName } from '../../shared/utils/invites'

export const inviteSubject = (inviterName: string) => `${inviterName} would like to write to you`

export const inviteLink = (appUrl: string, token: string) => `${appUrl}/invite/${token}`

export function inviteEmail(
  brand: Branding,
  invite: {
    inviterName: string
    token: string
    mantelName?: string | null
    familyName?: string | null
  },
): EmailContent {
  if (invite.familyName) {
    return composeEmail(
      'family-invite',
      `${invite.inviterName} invites you to ${invite.familyName}`,
      brand,
      {
        inviterName: invite.inviterName,
        // A family's name is held to the display-name rule when it is made.
        familyName: invite.familyName,
        url: inviteLink(brand.appUrl, invite.token),
        expiresDays: INVITE_TTL_DAYS,
      },
    )
  }
  if (invite.mantelName) {
    const mantelName = mailableMantelName(invite.mantelName)
    return composeEmail(
      'mantel-invite',
      `${invite.inviterName} asks you to write to ${mantelName}`,
      brand,
      {
        inviterName: invite.inviterName,
        mantelName,
        url: inviteLink(brand.appUrl, invite.token),
        expiresDays: INVITE_TTL_DAYS,
      },
    )
  }
  return composeEmail('invite', inviteSubject(invite.inviterName), brand, {
    inviterName: invite.inviterName,
    url: inviteLink(brand.appUrl, invite.token),
    expiresDays: INVITE_TTL_DAYS,
  })
}
