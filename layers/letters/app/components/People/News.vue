<script setup lang="ts">
// The children whose news this person reads, and the way to stop. It never
// shows who else reads it.
interface Reading {
  mantelId: string
  name: string
  since: string
}

const { data, refresh } = await useFetch<{ news: Reading[] }>('/api/letters/news')
const reading = computed(() => data.value?.news ?? [])
const failure = ref<string | null>(null)

async function stop(mantelId: string) {
  failure.value = null
  try {
    await $fetch('/api/letters/news/leave', { method: 'POST', body: { mantelId } })
    await refresh()
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'
  }
}
</script>

<template>
  <section v-if="reading.length" aria-labelledby="reading-heading" class="flex flex-col gap-3">
    <h2 id="reading-heading" class="text-xl text-highlighted">News you get</h2>
    <p class="text-sm text-muted">
      Letters of news from the people who keep a child's mantel. They arrive on your mantel like any
      letter. You can read them and cannot write back.
    </p>
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />
    <ul class="flex flex-col divide-y divide-default">
      <li
        v-for="child in reading"
        :key="child.mantelId"
        class="flex items-center justify-between gap-4 py-3"
      >
        <span class="text-highlighted">News of {{ child.name }}</span>
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          :aria-label="`Stop getting news of ${child.name}`"
          @click="stop(child.mantelId)"
        >
          Stop
        </UButton>
      </li>
    </ul>
  </section>
</template>
