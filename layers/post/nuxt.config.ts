// The post office: the postal calendar, transit times, the release task,
// notices and the dev clock. Everything that decides *when* lives here, as
// pure functions in shared/utils that take `now` as an argument, so the
// browser, the server and the tests all compute the same dates.
import { fileURLToPath } from 'node:url'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineNuxtConfig({
  $meta: { name: 'post' },

  // The dev clock's bar and page exist only in local development. They are
  // registered here rather than found under plugins/ and pages/, so a
  // production build has neither. Its API routes end in `.dev.ts`.
  $development: {
    plugins: [{ src: here('./app/dev/clock-plugin.ts'), mode: 'client' }],
    hooks: {
      'components:dirs'(dirs) {
        dirs.push({ path: here('./app/dev'), pattern: 'DevClockBar.vue', global: true })
      },
      'pages:extend'(pages) {
        pages.push({ name: 'dev-post', path: '/dev/post', file: here('./app/dev/PostOffice.vue') })
      },
    },
  },
})
