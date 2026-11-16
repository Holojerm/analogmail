// How long the send-off plays (Letter/SendOff.vue), and whether to play it.

export const SEND_OFF_MS = 2000

/** Shows the send-off, waits for it to finish, and resolves. Skipped when motion is turned down. */
export function useSendOff() {
  const playing = ref(false)
  async function play(): Promise<void> {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    playing.value = true
    await new Promise((resolve) => setTimeout(resolve, SEND_OFF_MS))
  }
  return { playing, play }
}
