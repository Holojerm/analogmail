// A new recovery code is shown once, before the app: until the person
// confirms they wrote it down, the page sign-in lands on and every page that
// opens letters lead to it. Account and security pages stay reachable.
//
// On a first load the redirect waits until the page has hydrated; see
// ./keys.ts for why.
const LANDING = '/dashboard'

export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  const { loggedIn } = useUserSession()
  const { recoveryCode } = useKeys()
  const guarded = to.path === LANDING || [to.meta.middleware ?? []].flat().includes('keys')
  const pending = () => loggedIn.value && recoveryCode.value && guarded

  if (useNuxtApp().isHydrating) {
    onNuxtReady(async () => {
      if (pending()) await navigateTo('/welcome/recovery-code')
    })
    return
  }
  if (pending()) return navigateTo('/welcome/recovery-code')
})
