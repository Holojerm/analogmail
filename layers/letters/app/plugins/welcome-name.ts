// The name correspondents see is asked on the welcome page, beside the city.
// Loaded only there: a plugin runs on every page, and the field brings the
// name's schema with it.
export default defineNuxtPlugin(() => {
  registerWelcomeField(
    'name',
    defineAsyncComponent(() => import('../components/People/WelcomeName.vue')),
  )
})
