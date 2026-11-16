// Correspondence: invites, the pairs they create, letters and their keys.
// The server stores and returns ciphertext only; it never sees letter text,
// stationery or photos. When things arrive is the post layer's business.
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  $meta: { name: 'letters' },

  css: [fileURLToPath(new URL('./app/assets/css/letter.css', import.meta.url))],

  // The editor's document library is installed at two versions, and a second
  // copy in the bundle breaks Enter and lists ("prosemirror-model is loaded
  // more than once"). One copy of each, whatever the lockfile holds.
  vite: {
    resolve: {
      dedupe: [
        'prosemirror-model',
        'prosemirror-state',
        'prosemirror-transform',
        'prosemirror-view',
      ],
    },
  },

  // The faces a letter can be written in (letter.css). All open-source, and
  // downloaded at build time and served from this origin like the app's own
  // three. Bold is listed where the family has one; the rest synthesise it.
  fonts: {
    families: [
      { name: 'Lora', weights: [400, 700], styles: ['normal', 'italic'] },
      { name: 'Courier Prime', weights: [400, 700], styles: ['normal', 'italic'] },
      { name: 'Caveat', weights: [400, 700], styles: ['normal'] },
      { name: 'Kalam', weights: [400, 700], styles: ['normal'] },
      { name: 'Homemade Apple', weights: [400], styles: ['normal'] },
    ],
  },
})
