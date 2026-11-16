// The mantel is home. Sign-in and sign-up finish on the template's
// /dashboard; someone signed in is taken on to their mantel.
export default defineNuxtRouteMiddleware((to) => {
  if (to.path !== '/dashboard') return
  if (!useUserSession().loggedIn.value) return
  return navigateTo('/mantel', { replace: true })
})
