// The notice as a notification, for the devices a person turned them on in
// (layers/pwa). The only thing in this product that pushes.
//
// Like the email it has fixed wording and takes only who to tell, so it cannot
// name a sender, count letters or quote one. The message is encrypted to the
// browser; the push service in between learns that this app sent something.

import type { PushMessage } from '#layers/pwa/shared/utils/push'

import { NOTICE_SUBJECT } from './email'

export const NOTICE_PUSH: PushMessage = {
  title: NOTICE_SUBJECT,
  body: 'Open your mantel to read it.',
  url: '/mantel',
}

/** `dispatchNotices`'s `push` option, around the layer's `sendPush` (./current.ts). */
export function createPushNotice(
  send: (userId: string, message: PushMessage) => Promise<{ sent: number }>,
) {
  return async (userId: string): Promise<number> => (await send(userId, NOTICE_PUSH)).sent
}
