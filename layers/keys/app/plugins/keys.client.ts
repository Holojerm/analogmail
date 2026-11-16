// Wires the keys to sign-in and sign-out. The credentials layer awaits the
// hook, so by the time its page navigates on, the key is open or the status
// says why not.
export default defineNuxtPlugin((nuxtApp) => {
  const keys = useKeys()
  const { loggedIn } = useUserSession()

  nuxtApp.hook('credentials:unlock', (unlock) => keys.onUnlock(unlock))
  watch(loggedIn, (now, before) => {
    if (before && !now) void keys.forget()
  })
})
