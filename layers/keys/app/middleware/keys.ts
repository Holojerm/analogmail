// For pages that open letters: this device must hold the private key. Use
// after `auth`: `definePageMeta({ middleware: ['auth', 'keys'] })`.
export default defineNuxtRouteMiddleware(async (to) => {
  // The key lives in the browser, so the server cannot decide. The page
  // renders its own waiting state and this runs again on the client.
  if (import.meta.server) return
  const keys = useKeys()
  const status = keys.status.value === 'ready' ? 'ready' : await keys.refresh()
  if (status !== 'ready') return navigateTo({ path: '/unlock', query: { redirect: to.fullPath } })
})
