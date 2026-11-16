// A new recovery code is shown once, before anything else: until the person
// confirms they wrote it down, every signed-in page leads to it.
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  const { loggedIn } = useUserSession()
  const { recoveryCode } = useKeys()
  if (!loggedIn.value || !recoveryCode.value) return
  const gated = [to.meta.middleware ?? []].flat().includes('auth')
  if (gated && to.path !== '/welcome/recovery-code') return navigateTo('/welcome/recovery-code')
})
