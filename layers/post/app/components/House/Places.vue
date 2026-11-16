<script setup lang="ts">
// The four places of the house, which are the whole of the navigation: inline
// in the header, or as the bar at the bottom of a phone. DESIGN.md › The house.
defineProps<{ bar?: boolean }>()

const route = useRoute()

// `under` is every path that belongs to a place, so a letter being read still
// marks the mantel it came from.
const places = [
  {
    label: 'Mantel',
    to: '/mantel',
    icon: 'i-lucide-mail',
    under: ['/mantel', '/letter', '/mantels', '/kept', '/archive'],
  },
  { label: 'Desk', to: '/desk', icon: 'i-lucide-pen-line', under: ['/desk', '/write'] },
  { label: 'People', to: '/people', icon: 'i-lucide-users', under: ['/people', '/family'] },
  { label: 'Room', to: '/rooms', icon: 'i-lucide-armchair', under: ['/rooms', '/room'] },
]

function current(place: (typeof places)[number]): 'page' | 'true' | undefined {
  if (route.path === place.to) return 'page'
  return place.under.some((path) => route.path === path || route.path.startsWith(`${path}/`))
    ? 'true'
    : undefined
}
</script>

<template>
  <nav
    v-if="bar"
    aria-label="Places"
    class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default pb-safe"
  >
    <ul class="mx-auto grid max-w-md grid-cols-4">
      <li v-for="place in places" :key="place.to">
        <NuxtLink
          :to="place.to"
          :aria-current="current(place)"
          class="flex flex-col items-center gap-1 py-2 text-xs text-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary aria-[current]:font-medium aria-[current]:text-highlighted"
        >
          <UIcon :name="place.icon" class="size-5" />
          {{ place.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>

  <nav v-else aria-label="Places" class="flex items-center gap-6 text-sm">
    <NuxtLink
      v-for="place in places"
      :key="place.to"
      :to="place.to"
      :aria-current="current(place)"
      class="rounded-sm py-1 text-muted underline-offset-8 hover:text-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-[current]:text-highlighted aria-[current]:underline"
    >
      {{ place.label }}
    </NuxtLink>
  </nav>
</template>
