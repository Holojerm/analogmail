// For pages that open letters: this device must hold the private key. Use
// after `auth`: `definePageMeta({ middleware: ['auth', 'keys'] })`.
//
// The key lives in the browser, so the server cannot decide and renders the
// page. On that first load the check waits until the page has hydrated: a
// redirect in the middle of hydration would swap the page under the server's
// markup.
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const keys = useKeys()
  const locked = async () => {
    const status = keys.status.value === 'ready' ? 'ready' : await keys.refresh()
    return status === 'ready' ? null : { path: '/unlock', query: { redirect: to.fullPath } }
  }

  if (useNuxtApp().isHydrating) {
    onNuxtReady(async () => {
      const target = await locked()
      if (target) await navigateTo(target)
    })
    return
  }
  const target = await locked()
  if (target) return navigateTo(target)
})
