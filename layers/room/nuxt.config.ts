// The family room: a family's shared photo album (check-ins, the map and the
// screen come later). It is not end-to-end encrypted, and says so on every
// page. Its data is never mixed with letters: its own tables, its own storage
// prefix, and no import from layers/letters. Who is in a family is told to it
// through server/utils/room-families.ts.
export default defineNuxtConfig({
  $meta: { name: 'room' },
})
