// Nothing in the post works without a city: transit, the time zone, the mail
// days. Someone who has not chosen one is sent to /welcome from the page
// sign-in lands on. Account and security pages stay reachable without one, so
// a person can always manage or delete their account.
//
// The check runs in the browser. On a first load it waits until the page has
// hydrated: a redirect in the middle of hydration would swap the page under
// the server's markup.
const NEEDS_A_CITY = ['/dashboard']

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const { loggedIn } = useUserSession()
  const postal = usePostalProfile()
  if (!loggedIn.value) return postal.reset()
  if (!NEEDS_A_CITY.includes(to.path)) return

  const missing = async () => {
    try {
      return !(await postal.load())
    } catch {
      // The page's own requests will report the failure.
      return false
    }
  }
  if (useNuxtApp().isHydrating) {
    onNuxtReady(async () => {
      if (await missing()) await navigateTo('/welcome')
    })
    return
  }
  if (await missing()) return navigateTo('/welcome')
})
