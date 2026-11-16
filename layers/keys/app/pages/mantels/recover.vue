<script setup lang="ts">
// Using a mantel's printed recovery code. The code opens the mantel's key in
// this browser and is never sent anywhere. A keeper gets their access back at
// once; anyone else asks to become a keeper, and the keepers get time to say no.
import { RECOVERY_WAIT_DAYS } from '../../../shared/utils/mantel-format'

definePageMeta({ middleware: ['auth', 'keys'] })

const mantelKeys = useMantelKeys()
const code = ref('')
const pending = ref(false)
const failure = ref<string | null>(null)
const done = ref<
  | { status: 'restored'; mantelId: string; name: string }
  | { status: 'waiting'; readyAt: string; name: string }
  | null
>(null)

async function submit() {
  pending.value = true
  failure.value = null
  try {
    const result = await mantelKeys.recover(code.value)
    if (result.status === 'bad-code') {
      failure.value = 'That does not look like a recovery code. It is eight groups of four.'
    } else if (result.status === 'unknown') {
      failure.value = 'That code does not open a mantel.'
    } else {
      done.value = result
      code.value = ''
    }
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'
  } finally {
    pending.value = false
  }
}

const readyOn = computed(() =>
  done.value?.status === 'waiting'
    ? new Date(done.value.readyAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '',
)

useSeo({
  title: "Use a mantel's recovery code",
  description: 'Open a kept mantel with its printed recovery code.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6 py-8 sm:py-12">
    <div>
      <h1 class="text-3xl text-highlighted">Use a mantel's recovery code</h1>
      <p class="mt-2 font-serif text-lg text-toned">
        The code printed when a mantel was opened. It opens the mantel's key on this device and is
        not sent to us.
      </p>
    </div>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />

    <template v-if="done?.status === 'restored'">
      <UAlert
        color="success"
        variant="subtle"
        icon="i-lucide-check"
        :title="`This device can open ${done.name}'s mantel again`"
        description="Nothing else changed: you kept this mantel already."
      />
      <UButton class="self-start" :to="`/mantels/${done.mantelId}`">Open the mantel</UButton>
    </template>

    <template v-else-if="done?.status === 'waiting'">
      <UAlert
        color="info"
        variant="subtle"
        icon="i-lucide-hourglass"
        :title="`You will keep ${done.name}'s mantel from ${readyOn}`"
        :description="`Its keepers have been told, and any of them can cancel this before then. That is what the ${RECOVERY_WAIT_DAYS} days are for. Come back on that day to finish.`"
      />
      <UButton class="self-start" variant="outline" color="neutral" to="/mantels">
        Back to the mantels you keep
      </UButton>
    </template>

    <UCard v-else>
      <form class="flex flex-col gap-6" @submit.prevent="submit">
        <UFormField
          label="Recovery code"
          name="code"
          help="Eight groups of four. Capitals and dashes do not matter."
        >
          <UInput
            v-model="code"
            size="lg"
            class="w-full font-mono"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
          />
        </UFormField>
        <p class="text-sm text-muted">
          If you already keep this mantel, your access comes back at once. If you do not, you are
          asking to become a keeper: its keepers are told, and it takes effect after
          {{ RECOVERY_WAIT_DAYS }} days unless one of them cancels.
        </p>
        <UButton type="submit" class="self-start" :loading="pending" :disabled="!code.trim()">
          Use the code
        </UButton>
      </form>
    </UCard>
  </div>
</template>
