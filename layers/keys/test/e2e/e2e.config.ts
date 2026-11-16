// The credentials layer is already on in nuxt.config.ts, so the spec needs no
// environment; only its rows cleared afterwards.
import type { LayerE2e } from '../../../../test/e2e/layers'

export default {
  globalTeardown: ['./global-teardown.ts'],
} satisfies LayerE2e
