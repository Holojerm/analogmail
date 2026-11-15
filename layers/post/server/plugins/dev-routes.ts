// The dev clock works signed out, so its routes skip the session check. In a
// production build `import.meta.dev` is `false` and the routes do not exist.
import { registerPublicApiRoutes } from '#server/utils/public-routes'

export default defineNitroPlugin(() => {
  if (import.meta.dev) registerPublicApiRoutes([{ path: '/api/dev/', match: 'prefix' }])
})
