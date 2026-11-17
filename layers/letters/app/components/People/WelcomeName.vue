<script setup lang="ts">
// The name correspondents see, asked once on the welcome page so that nobody
// is stopped for it later, in the middle of accepting an invitation.
import { DISPLAY_NAME_MAX, displayNameSchema } from '../../../shared/utils/invites'

const name = ref('')
const failure = ref<string | null>(null)

onMounted(async () => {
  try {
    const kept = (await $fetch<{ name: string | null }>('/api/letters/name')).name
    // Never over what the person has typed while this was on its way.
    if (kept && !name.value) name.value = kept
  } catch {
    // An empty field is the right start either way.
  }
})

const ready = computed(() => name.value.trim().length > 0)

async function save(): Promise<boolean> {
  const parsed = displayNameSchema.safeParse(name.value)
  if (!parsed.success) {
    failure.value = parsed.error.issues[0]?.message ?? 'Enter a name'
    return false
  }
  failure.value = null
  try {
    await $fetch('/api/letters/name', { method: 'PUT', body: { name: parsed.data } })
    return true
  } catch {
    failure.value = 'Could not save your name. Try again.'
    return false
  }
}

defineExpose({ ready, save })
</script>

<template>
  <UFormField
    label="Your name"
    name="name"
    help="What the people you write with will see. Use the name they know you by."
    :error="failure ?? undefined"
  >
    <UInput
      v-model="name"
      size="lg"
      class="w-full"
      autocomplete="name"
      :maxlength="DISPLAY_NAME_MAX"
    />
  </UFormField>
</template>
