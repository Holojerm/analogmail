// The dev notifier. Sends nothing: the notice is marked sent and shows in the
// outbox at /dev/post. Loaded only when `import.meta.dev` is true.

import type { Notifier } from '../notify/notifier'

export const outboxNotifier: Notifier = {
  channel: 'email',
  ready: () => true,
  notify: async () => ({ ok: true }),
}
