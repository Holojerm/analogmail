// The post office: the postal calendar, transit times, the release task,
// notices and the dev clock. Everything that decides *when* lives here, as
// pure functions in shared/utils that take `now` as an argument, so the
// browser, the server and the tests all compute the same dates.
export default defineNuxtConfig({
  $meta: { name: 'post' },
})
