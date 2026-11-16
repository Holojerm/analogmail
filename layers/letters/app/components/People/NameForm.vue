<script setup lang="ts">
// Choosing the name correspondents see. Used before a first invitation and
// before accepting one.
import { DISPLAY_NAME_MAX, displayNameSchema } from '../../../shared/utils/invites'

const props = defineProps<{ current?: string | null; submitLabel?: string }>()
const emit = defineEmits<{ saved: [name: string] }>()

const name = ref(props.current ?? '')
const pending = ref(false)
const failure = ref<string | null>(null)

async function save() {
  const parsed = displayNameSchema.safeParse(name.value)
  if (!parsed.success) {
    failure.value = parsed.error.issues[0]?.message ?? 'Enter a name'
    return
  }
  pending.value = true
  failure.value = null
  try {
    const saved = await $fetch<{ name: string }>('/api/letters/name', {
      method: 'PUT',
      body: { name: parsed.data },
    })
    emit('saved', saved.name)
  } catch {
    failure.value = 'Could not save that. Try again.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="save">
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
    <UButton type="submit" :loading="pending" class="self-start">
      {{ submitLabel ?? 'Save name' }}
    </UButton>
  </form>
</template>
