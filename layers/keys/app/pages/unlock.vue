<script setup lang="ts">
// Signed in, but this device does not hold the key that opens letters: a new
// device after a passkey without its secret, or a password reset by email.
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const keys = useKeys()
const { unlock } = useCredentials()

const target = computed(() => {
  const value = route.query.redirect
  return safeRedirectPath(typeof value === 'string' ? value : undefined, '/dashboard')
})

const password = ref('')
const code = ref('')
const pending = ref<'password' | 'code' | null>(null)
const failure = ref<string | null>(null)

onMounted(async () => {
  if ((await keys.refresh()) === 'ready') await navigateTo(target.value, { replace: true })
})

async function withPassword() {
  pending.value = 'password'
  failure.value = null
  try {
    // Checks the password with the server, then hands the key it derives to
    // the keys plugin through `credentials:unlock`.
    await unlock(password.value)
    if (keys.status.value === 'ready') return await navigateTo(target.value)
    failure.value =
      'That is your password, but it cannot open your letters here. It was reset by email since they were last opened. Use your recovery code.'
  } catch (error) {
    failure.value = credentialsErrorMessage(error)
  } finally {
    pending.value = null
  }
}

async function withCode() {
  pending.value = 'code'
  failure.value = null
  try {
    if (await keys.openWithRecoveryCode(code.value)) return await navigateTo(target.value)
    failure.value = 'That recovery code does not open your letters. Check it and try again.'
  } catch {
    failure.value = 'Something went wrong. Try again.'
  } finally {
    pending.value = null
  }
}

useSeo({
  title: 'Open your letters',
  description: 'Unlock the key that opens your letters on this device.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6 py-8 sm:py-12">
    <div>
      <h1 class="text-3xl text-highlighted">Open your letters</h1>
      <p class="mt-2 font-serif text-lg text-toned">
        You are signed in. Your letters are locked with a key that this device does not hold yet.
      </p>
    </div>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />

    <UCard>
      <form class="flex flex-col gap-4" @submit.prevent="withPassword">
        <UFormField label="Password" name="password">
          <UInput
            v-model="password"
            type="password"
            autocomplete="current-password"
            size="lg"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          size="lg"
          block
          :loading="pending === 'password'"
          :disabled="!password"
        >
          Open with my password
        </UButton>
      </form>
    </UCard>

    <UCard>
      <form class="flex flex-col gap-4" @submit.prevent="withCode">
        <UFormField
          label="Recovery code"
          name="code"
          help="The eight groups of four you wrote down when you signed up."
        >
          <UInput
            v-model="code"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            size="lg"
            class="w-full font-mono"
          />
        </UFormField>
        <UButton
          type="submit"
          size="lg"
          color="neutral"
          variant="soft"
          block
          :loading="pending === 'code'"
          :disabled="!code"
        >
          Open with my recovery code
        </UButton>
      </form>
    </UCard>
  </div>
</template>
