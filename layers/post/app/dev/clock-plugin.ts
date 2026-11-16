// Mounts the dev clock bar beside the app, so no shared layout has to know
// about it. This plugin and the bar component are registered by
// layers/post/nuxt.config.ts in development only.
import { h, render } from 'vue'

export default defineNuxtPlugin((nuxtApp) => {
  // The browser suites run against the dev server and should see the app alone.
  if (navigator.webdriver) return

  nuxtApp.hook('app:mounted', () => {
    const DevClockBar = nuxtApp.vueApp.component('DevClockBar')
    if (!DevClockBar) return
    const host = document.createElement('div')
    document.body.append(host)
    const bar = h(DevClockBar)
    bar.appContext = nuxtApp.vueApp._context
    render(bar, host)
  })
})
