<script setup lang="ts">
// Shows a new recovery code once. It leaves the page only by being confirmed.
// On a phone there is rarely a pen to hand, so the code can also be printed or
// saved as a file: both happen on this device and send nothing anywhere.
const props = defineProps<{ code: string }>()
const emit = defineEmits<{ confirmed: [] }>()

const appName = useRuntimeConfig().public.appName
const kept = ref(false)
const copied = ref(false)

async function copy() {
  await navigator.clipboard.writeText(props.code)
  copied.value = true
}

function save() {
  const text = [
    `${appName} recovery code`,
    '',
    props.code,
    '',
    'With this code you can open your letters again if you forget your password.',
    'Keep it somewhere safe, away from the device you sign in on. We do not keep a copy.',
    '',
  ].join('\n')
  saveFile(new Blob([text], { type: 'text/plain' }), 'recovery-code.txt')
}

const print = () => window.print()
</script>

<template>
  <UCard>
    <div class="recovery-sheet flex flex-col gap-5">
      <p class="recovery-sheet-title hidden text-xl text-highlighted">
        {{ appName }} recovery code
      </p>
      <p
        class="font-mono text-lg tracking-wide break-words text-highlighted"
        data-testid="recovery-code"
      >
        {{ code }}
      </p>
      <p class="text-sm text-muted">
        Write it down, print it or save it, and keep it somewhere safe, away from this device. It is
        shown once and we do not keep a copy.
      </p>
      <div class="recovery-sheet-actions flex flex-col gap-5">
        <div class="flex flex-wrap items-center gap-3">
          <UButton color="neutral" variant="soft" icon="i-lucide-copy" @click="copy">
            {{ copied ? 'Copied' : 'Copy' }}
          </UButton>
          <UButton color="neutral" variant="soft" icon="i-lucide-printer" @click="print">
            Print
          </UButton>
          <UButton color="neutral" variant="soft" icon="i-lucide-download" @click="save">
            Save as a file
          </UButton>
        </div>
        <UCheckbox v-model="kept" label="I have kept my recovery code somewhere safe" />
        <UButton size="lg" block :disabled="!kept" @click="emit('confirmed')">Continue</UButton>
      </div>
    </div>
  </UCard>
</template>

<!-- Printing this page prints the code and nothing else. Guarded by :has so
     that it cannot blank another page's printout once this style is loaded. -->
<style>
@media print {
  body:has(.recovery-sheet) * {
    visibility: hidden;
  }
  body:has(.recovery-sheet) .recovery-sheet,
  body:has(.recovery-sheet) .recovery-sheet * {
    visibility: visible;
  }
  .recovery-sheet {
    position: absolute;
    top: 0;
    left: 0;
    padding: 2rem;
  }
  .recovery-sheet .recovery-sheet-title {
    display: block;
  }
  .recovery-sheet .recovery-sheet-actions {
    display: none;
  }
}
</style>
