<script setup lang="ts">
// Once someone is in, one offer of the other way to sign in: a password for an
// account made with Face ID (for a computer that does not have the passkey), or
// Face ID for an account made with a password. Asked once per person per device,
// whatever the answer; after that it lives on the security page.
import { z } from 'zod'

const keys = useKeys()
const passkeys = usePasskeys()
const { setPassword } = useCredentials()
const { user } = useUserSession()
const toast = useToast()

const hasPassword = ref<boolean | null>(null)
const hasPasskey = ref<boolean | null>(null)
/** Face ID is offered only where the device has a built-in unlock to make it with. */
const platformUnlock = ref(false)
const closed = ref(false)

const storageKey = computed(() => `dearmantel:second-way-in:${user.value?.id ?? ''}`)
function asked(): boolean {
  try {
    return localStorage.getItem(storageKey.value) !== null
  } catch {
    return false
  }
}
function remember() {
  try {
    localStorage.setItem(storageKey.value, '1')
  } catch {
    // Offered again on the next visit: the one cost of a browser that keeps nothing.
  }
}

onMounted(async () => {
  if (!user.value || asked() || (await keys.refresh()) !== 'ready') return
  try {
    const [me, listed, platform] = await Promise.all([
      $fetch<{ hasPassword: boolean }>('/api/credentials/me'),
      $fetch<{ passkeys: unknown[] }>('/api/credentials/passkeys'),
      window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.() ?? false,
    ])
    platformUnlock.value = platform
    hasPassword.value = me.hasPassword
    hasPasskey.value = listed.passkeys.length > 0
  } catch {
    // Nothing offered; the security page has both.
  }
})

const offer = computed<'password' | 'passkey' | null>(() => {
  if (closed.value || hasPassword.value === null) return null
  if (!hasPassword.value) return 'password'
  return !hasPasskey.value && platformUnlock.value && passkeys.canCreateAccount.value
    ? 'passkey'
    : null
})
watch(offer, (value) => value && remember())

const open = computed({
  get: () => offer.value !== null,
  set: (value) => {
    if (!value) closed.value = true
  },
})
const method = computed(() => passkeys.device.value.method)

const schema = z.object({ password: credentialsPasswordFieldSchema })
const state = reactive({ password: '' })
const pending = ref(false)
const failure = ref<string | null>(null)

async function addPassword() {
  pending.value = true
  failure.value = null
  try {
    await setPassword(state.password)
    closed.value = true
    toast.add({ title: 'Password added', color: 'success' })
  } catch (error) {
    failure.value = credentialsErrorMessage(error)
  } finally {
    pending.value = false
  }
}

async function addPasskey() {
  pending.value = true
  failure.value = null
  try {
    await passkeys.register(passkeys.device.value.label)
    closed.value = true
    toast.add({ title: `${method.value} is ready`, color: 'success' })
  } catch (error) {
    failure.value = credentialsErrorMessage(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="offer === 'password' ? 'Add a password too?' : `Sign in with ${method} next time?`"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <p v-if="offer === 'password'" class="text-toned">
          You sign in with {{ method }}. A password lets you open your letters on a computer that
          doesn't have it.
        </p>
        <p v-else class="text-toned">
          Then you won't need to type your password on this device. Your password still works.
        </p>

        <UForm
          v-if="offer === 'password'"
          :schema="schema"
          :state="state"
          class="flex flex-col gap-4"
          @submit="addPassword"
        >
          <UFormField
            label="New password"
            name="password"
            :help="`At least ${CREDENTIALS_MIN_PASSWORD_LENGTH} characters.`"
          >
            <UInput
              v-model="state.password"
              type="password"
              autocomplete="new-password"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <UAlert
            v-if="failure"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="failure"
          />
          <UButton type="submit" size="lg" block :loading="pending">Add a password</UButton>
        </UForm>

        <template v-else>
          <UAlert
            v-if="failure"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="failure"
          />
          <UButton
            size="lg"
            block
            icon="i-lucide-fingerprint"
            :loading="pending"
            @click="addPasskey"
          >
            Use {{ method }}
          </UButton>
        </template>

        <UButton color="neutral" variant="ghost" size="lg" block @click="open = false">
          Not now
        </UButton>
        <p class="text-sm text-muted">
          You can do this later from Account, under Password and passkeys.
        </p>
      </div>
    </template>
  </UModal>
</template>
