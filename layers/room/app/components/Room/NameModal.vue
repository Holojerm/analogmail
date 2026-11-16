<script setup lang="ts">
// Name a new album or rename one; the page decides which and does the request.
import { ROOM_ALBUM_NAME_MAX } from '../../../shared/utils/room-types'

const props = defineProps<{ title: string; submitLabel: string; initialName?: string }>()
const emit = defineEmits<{ submit: [name: string] }>()
const open = defineModel<boolean>('open', { required: true })
const saving = defineModel<boolean>('saving', { default: false })

const name = ref('')
watch(open, (isOpen) => {
  if (isOpen) name.value = props.initialName ?? ''
})
</script>

<template>
  <UModal v-model:open="open" :title="title" description="Everyone in the family sees its name.">
    <template #body>
      <form class="flex flex-col gap-4" @submit.prevent="emit('submit', name)">
        <UFormField label="Album name" name="album-name">
          <UInput
            v-model="name"
            required
            :maxlength="ROOM_ALBUM_NAME_MAX"
            size="lg"
            class="w-full"
            autocomplete="off"
          />
        </UFormField>
        <UButton type="submit" :loading="saving" :disabled="!name.trim()" class="self-start">
          {{ submitLabel }}
        </UButton>
      </form>
    </template>
  </UModal>
</template>
