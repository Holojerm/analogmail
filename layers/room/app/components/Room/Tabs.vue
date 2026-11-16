<script setup lang="ts">
// The parts of one family's room.
const props = defineProps<{ familyId: string }>()
const route = useRoute()
const links = computed(() => [
  { label: 'Photos', to: `/room/${props.familyId}` },
  { label: 'Where everyone is', to: `/room/${props.familyId}/where` },
  { label: 'Gazette', to: `/room/${props.familyId}/gazette` },
])
// A page under a tab (one issue of the gazette) keeps that tab marked.
const current = (to: string) =>
  route.path === to || (to.endsWith('/gazette') && route.path.startsWith(`${to}/`))
</script>

<template>
  <nav aria-label="Family room" class="flex gap-6 text-sm">
    <ULink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      :aria-current="current(link.to) ? 'page' : undefined"
      class="text-muted underline-offset-4 hover:text-default aria-[current=page]:text-highlighted aria-[current=page]:underline"
    >
      {{ link.label }}
    </ULink>
  </nav>
</template>
