<script setup lang="ts">
// The families someone is in, and starting one. A letter to a family goes to
// everyone in it, each copy on that person's own post.
interface FamilyRow {
  id: string
  name: string
}

const { data, refresh } = await useFetch<{ families: FamilyRow[] }>('/api/letters/families')
const families = computed(() => data.value?.families ?? [])
const name = ref('')
const pending = ref(false)
const failure = ref<string | null>(null)

async function start() {
  pending.value = true
  failure.value = null
  try {
    const made = await $fetch<{ id: string }>('/api/letters/families', {
      method: 'POST',
      body: { name: name.value },
    })
    name.value = ''
    await refresh()
    await navigateTo(`/family/${made.id}`)
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section aria-labelledby="families-heading" class="flex flex-col gap-3">
    <h2 id="families-heading" class="text-xl text-highlighted">Families</h2>
    <p class="text-sm text-muted">
      A letter to a family goes to everyone in it at once. Each copy travels to that person's own
      city and arrives on their own mail day.
    </p>
    <p class="text-sm text-muted">
      Each family has a room for its photos:
      <ULink to="/rooms" class="underline">family rooms</ULink>.
    </p>
    <ul v-if="families.length" class="flex flex-col divide-y divide-default">
      <li
        v-for="family in families"
        :key="family.id"
        class="flex items-center justify-between gap-4 py-3"
      >
        <span class="text-highlighted">{{ family.name }}</span>
        <UButton
          size="sm"
          variant="outline"
          color="neutral"
          :to="`/family/${family.id}`"
          :aria-label="`Open ${family.name}`"
        >
          Open
        </UButton>
      </li>
    </ul>
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />
    <form class="flex flex-col gap-3" @submit.prevent="start">
      <UFormField
        label="Start a family"
        name="family-name"
        help="Its name, as its members would say it: The Lees."
      >
        <UInput v-model="name" maxlength="40" size="lg" class="w-full" autocomplete="off" />
      </UFormField>
      <UButton type="submit" class="self-start" :loading="pending" :disabled="!name.trim()">
        Start the family
      </UButton>
    </form>
  </section>
</template>
