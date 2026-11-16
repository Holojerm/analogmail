<script setup lang="ts">
// Replace the recovery code: for one that was lost, seen by someone else, or
// never written down.
definePageMeta({ middleware: ['auth', 'keys'] })

const keys = useKeys()
const pending = ref(false)
const failure = ref<string | null>(null)

async function replace() {
  pending.value = true
  failure.value = null
  try {
    if (!(await keys.replaceRecoveryCode())) failure.value = 'Could not make a new code. Try again.'
  } catch {
    failure.value = 'Could not make a new code. Try again.'
  } finally {
    pending.value = false
  }
}

async function confirmed() {
  keys.confirmRecoveryCode()
  await navigateTo('/account')
}

useSeo({
  title: 'Recovery code',
  description: 'Make a new recovery code for your letters.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6 py-8 sm:py-12">
    <div>
      <h1 class="text-3xl text-highlighted">Recovery code</h1>
      <p class="mt-2 font-serif text-lg text-toned">
        Your recovery code opens your letters if you lose your password. Making a new one stops the
        old one working.
      </p>
    </div>

    <ClientOnly>
      <RecoveryCodeCard
        v-if="keys.recoveryCode.value"
        :code="keys.recoveryCode.value"
        @confirmed="confirmed"
      />
      <UCard v-else>
        <div class="flex flex-col gap-4">
          <UAlert
            v-if="failure"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="failure"
          />
          <UButton size="lg" block :loading="pending" @click="replace">
            Make a new recovery code
          </UButton>
          <UButton to="/account" color="neutral" variant="ghost" block>Back to account</UButton>
        </div>
      </UCard>
    </ClientOnly>
  </div>
</template>
