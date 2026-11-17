<script setup lang="ts">
// Says the welcome note once: it is gone when the person leaves the page.
const note = useWelcomeNote()
const said = note.value
onBeforeUnmount(() => {
  if (note.value === said) note.value = null
})
</script>

<template>
  <p v-if="said" class="font-serif text-lg text-toned" role="status" data-testid="welcome-note">
    {{ said }}
  </p>
</template>
