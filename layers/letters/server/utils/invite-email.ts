// The invitation email: emails/templates/invite.vue. Fixed wording. It names
// the sender and carries the link, and nothing the sender wrote.

import { composeEmail, type Branding, type EmailContent } from '#server/utils/email-templates'

import { INVITE_TTL_DAYS } from '../../shared/utils/invites'

export const inviteSubject = (inviterName: string) => `${inviterName} would like to write to you`

export const inviteLink = (appUrl: string, token: string) => `${appUrl}/invite/${token}`

export function inviteEmail(
  brand: Branding,
  invite: { inviterName: string; token: string },
): EmailContent {
  return composeEmail('invite', inviteSubject(invite.inviterName), brand, {
    inviterName: invite.inviterName,
    url: inviteLink(brand.appUrl, invite.token),
    expiresDays: INVITE_TTL_DAYS,
  })
}
