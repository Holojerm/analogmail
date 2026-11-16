<script setup lang="ts">
// The first thing a new account sees: its recovery code, once.
definePageMeta({ middleware: 'auth' })

const keys = useKeys()

async function confirmed() {
  keys.confirmRecoveryCode()
  await navigateTo('/dashboard')
}

// Nothing to show (a reload after confirming, or a visit by hand): move on.
onMounted(() => {
  if (!keys.recoveryCode.value) void navigateTo('/dashboard', { replace: true })
})

useSeo({
  title: 'Your recovery code',
  description: 'The code that opens your letters if you ever lose your password.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6 py-8 sm:py-12">
    <div>
      <h1 class="text-3xl text-highlighted">Your recovery code</h1>
      <p class="mt-2 font-serif text-lg text-toned">
        Your letters are locked with a key only you hold. If you forget your password, we can let
        you back into your account by email, but only this code can open your letters again.
      </p>
    </div>
    <ClientOnly>
      <RecoveryCodeCard
        v-if="keys.recoveryCode.value"
        :code="keys.recoveryCode.value"
        @confirmed="confirmed"
      />
    </ClientOnly>
  </div>
</template>
