// Someone who opened an invitation before they had an account is taken back
// to it once sign-up is finished. Sign-up ends on /people, so that is where
// the link is picked up; the invite page forgets it when it is done.
//
// Decided in the browser, so on a first load it waits for hydration.
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server || to.path !== '/people') return
  if (!useUserSession().loggedIn.value) return
  const invite = pendingInvite()
  if (!invite) return
  const target = `/invite/${encodeURIComponent(invite.token)}`
  if (useNuxtApp().isHydrating) {
    onNuxtReady(() => navigateTo(target))
    return
  }
  return navigateTo(target)
})
