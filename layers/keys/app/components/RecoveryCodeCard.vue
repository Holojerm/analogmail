<script setup lang="ts">
// Shows a new recovery code once. It leaves the page only by being confirmed.
const props = defineProps<{ code: string }>()
const emit = defineEmits<{ confirmed: [] }>()

const written = ref(false)
const copied = ref(false)

async function copy() {
  await navigator.clipboard.writeText(props.code)
  copied.value = true
}
</script>

<template>
  <UCard>
    <div class="flex flex-col gap-5">
      <p
        class="font-mono text-lg tracking-wide break-words text-highlighted"
        data-testid="recovery-code"
      >
        {{ code }}
      </p>
      <p class="text-sm text-muted">
        Write it down and keep it somewhere safe, away from this device. It is shown once and we do
        not keep a copy.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <UButton color="neutral" variant="soft" icon="i-lucide-copy" @click="copy">
          {{ copied ? 'Copied' : 'Copy' }}
        </UButton>
      </div>
      <UCheckbox v-model="written" label="I have written my recovery code down" />
      <UButton size="lg" block :disabled="!written" @click="emit('confirmed')">Continue</UButton>
    </div>
  </UCard>
</template>
