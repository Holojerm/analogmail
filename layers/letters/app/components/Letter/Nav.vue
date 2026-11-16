<script setup lang="ts">
// The places of the app: what has arrived, what you are writing, who you
// write with, and the mantels you keep for someone else.
const route = useRoute()
const links = [
  { label: 'Mantel', to: '/mantel' },
  { label: 'Desk', to: '/desk' },
  { label: 'People', to: '/people' },
  { label: 'Keeping', to: '/mantels' },
  { label: 'Post', to: '/settings/post' },
]
</script>

<template>
  <nav aria-label="Letters" class="flex gap-6 border-b border-default pb-3 text-sm">
    <ULink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      :aria-current="route.path === link.to ? 'page' : undefined"
      class="text-muted hover:text-default aria-[current=page]:text-highlighted"
    >
      {{ link.label }}
    </ULink>
  </nav>
</template>
