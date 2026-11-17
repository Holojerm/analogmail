// Accepting an invitation, and where it leads. The person lands on the thing
// they were invited to, with one sentence saying what has begun.
import type { AcceptedInvite, InviteKind } from '../../shared/utils/invites'

interface About {
  sender: string
  mantelName?: string | null
  familyName?: string | null
}

export type AcceptRefusal = { reason: string | null; message: string }

const landing = (accepted: AcceptedInvite): string => {
  if (accepted.kind === 'family' && accepted.familyId) return `/room/${accepted.familyId}`
  if (accepted.kind === 'news') return '/mantel'
  return `/write?to=${accepted.correspondenceId}`
}

const NOTES: Record<InviteKind, (about: About) => string> = {
  person: ({ sender }) =>
    `You and ${sender} can write to each other now. Here is a sheet of paper for the first letter.`,
  mantel: ({ sender, mantelName }) =>
    `You can write to ${mantelName ?? 'the mantel'} now. ${sender} keeps it, and a letter can be sealed until a day you choose.`,
  news: ({ sender, mantelName }) =>
    `News of ${mantelName ?? 'the child'} will come here, a few days after ${sender} writes it. There is nothing more to set up.`,
  family: ({ familyName }) =>
    `You are in ${familyName ?? 'the family'} now. Add a photo, or say where you are.`,
}

export function useAcceptInvite() {
  const note = useWelcomeNote()

  /** Accepts, then goes to what was accepted. Gives back the refusal when there is one. */
  async function accept(
    by: { token: string } | { id: string },
    about: About,
  ): Promise<AcceptRefusal | null> {
    try {
      const accepted = await $fetch<AcceptedInvite>('/api/letters/invites/accept', {
        method: 'POST',
        body: by,
      })
      note.value = NOTES[accepted.kind](about)
      await navigateTo(landing(accepted))
      return null
    } catch (error) {
      const data = (error as { data?: { message?: string; data?: { reason?: string } } }).data
      return {
        reason: data?.data?.reason ?? null,
        message: data?.message ?? 'Could not accept this invitation.',
      }
    }
  }

  return { accept }
}
