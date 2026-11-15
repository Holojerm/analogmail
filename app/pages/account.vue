<script setup lang="ts">
// Everything a customer needs to do to themselves, in one page: email
// preferences, signing out, and taking or deleting their data.

definePageMeta({ middleware: 'auth' })

const { user, clear: clearSession } = useUserSession()
const { signOut, pending: signOutPending } = useSignOut()
const toast = useToast()
const config = useRuntimeConfig()

// ── Email preferences ───────────────────────────────────────────────────────
// One row per optional event type (welcome/onboarding today; product-update
// mail a later wave adds). Security email never shows
// up here — there is nothing to toggle, and a switch that silently didn't
// work would be worse than no switch (server/api/account/notifications.get.ts).
const { data: notificationPrefs, refresh: refreshNotificationPrefs } = await useFetch(
  '/api/account/notifications',
)
const notificationPending = ref<string | null>(null)

async function toggleNotification(eventType: string, enabled: boolean): Promise<void> {
  notificationPending.value = eventType
  try {
    await $fetch('/api/account/notifications', { method: 'PUT', body: { eventType, enabled } })
    await refreshNotificationPrefs()
  } catch {
    toast.add({ title: 'Could not update that preference', color: 'error' })
  } finally {
    notificationPending.value = null
  }
}

// No `?unsubscribed=` toast here any more: an email footer's unsubscribe link
// now lands on /unsubscribe, which is public and shows its own confirmation.
// It has to be — this page is auth-gated, so anyone reading their mail on a
// device they weren't signed in on used to get bounced to /login with no idea
// whether the opt-out had worked. See server/api/email/unsubscribe.get.ts.

// Every other device's cookie dies on its next request; this one is re-issued
// by the route, so nothing here has to change client state.
const { pending: revokePending, run: revokeOtherSessions } = useAsyncAction(
  () => $fetch<unknown>('/api/account/sessions/revoke', { method: 'POST' }),
  { errorTitle: 'Could not sign out other devices' },
)

async function signOutEverywhere(): Promise<void> {
  if (!(await revokeOtherSessions())) return
  toast.add({
    title: 'Signed out everywhere else',
    description: 'Every other device will need to sign in again. This one stays signed in.',
    color: 'success',
  })
}

// ── Your data ────────────────────────────────────────────────────────────────
// Self-serve export and deletion — exactly what /privacy promises under "your
// rights", moved off the support inbox. Routing account deletion through email
// is friction at the exit door: the whole point is that leaving isn't hard.
/**
 * `Content-Disposition` on the response doesn't make a `fetch()` download
 * anything — that header only does its job on a real navigation. Building the
 * Blob and clicking a throwaway anchor is what actually triggers "Save As"
 * from JS.
 *
 * Two details that look like ceremony and are not. The anchor is appended to
 * the document before it is clicked, because Safari and older WebKit ignore a
 * click on a node that is not in the tree — the download silently produced no
 * file. And the object URL is revoked on a later task, because revoking it in
 * the same tick can invalidate the blob before the browser has finished
 * starting the download, which fails the same silent way. Both failure modes
 * produce no error and no file, so nobody reports them as bugs; they report
 * "the export button doesn't work".
 */
const { pending: exportPending, run: downloadData } = useAsyncAction(
  async () => {
    const data = await $fetch('/api/account/export')
    const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = exportFilename(config.public.appName)
    link.style.display = 'none'
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  },
  { errorTitle: 'Could not download your data' },
)

const deleteOpen = ref(false)
const deletePending = ref(false)
const confirmEmailInput = ref('')
const canConfirmDelete = computed(
  () => confirmEmailInput.value.trim().toLowerCase() === (user.value?.email ?? '').toLowerCase(),
)

function openDeleteModal(): void {
  confirmEmailInput.value = ''
  deleteOpen.value = true
}

async function confirmDelete(): Promise<void> {
  deletePending.value = true
  try {
    await $fetch('/api/account/delete', {
      method: 'POST',
      body: { confirmEmail: confirmEmailInput.value },
    })
    deleteOpen.value = false
    await clearSession()
    await navigateTo('/')
  } catch {
    toast.add({
      title: 'Could not delete your account',
      description: 'Something went wrong. Try again, or reply to any email from us.',
      color: 'error',
    })
  } finally {
    deletePending.value = false
  }
}

useSeo({
  title: 'Account',
  description: 'Your account settings.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-8 py-12">
    <h1 class="text-3xl text-highlighted">Account</h1>

    <!-- Identity -->
    <UCard>
      <div class="flex items-center gap-4">
        <UAvatar :src="user?.avatarUrl ?? undefined" :alt="user?.name" size="lg" />
        <div class="min-w-0">
          <p class="truncate font-medium text-highlighted">{{ user?.name }}</p>
          <p class="truncate text-sm text-muted">{{ user?.email }}</p>
        </div>
        <UButton
          class="ml-auto"
          color="neutral"
          variant="outline"
          :loading="signOutPending"
          @click="signOut()"
        >
          Sign out
        </UButton>
      </div>
      <template #footer>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-sm text-muted">
            Signed in on a device you don't recognise, or lost one? Sign out of every other device
            at once.
          </p>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-log-out"
            :loading="revokePending"
            @click="signOutEverywhere"
          >
            Sign out everywhere
          </UButton>
        </div>
      </template>
    </UCard>

    <!-- Email preferences -->
    <UCard>
      <template #header>
        <h2 class="text-xl text-highlighted">Email preferences</h2>
      </template>

      <div class="flex flex-col gap-4">
        <!-- USwitch carries its own label/description (Nuxt UI renders both
             next to the control with a real <label>), so this doesn't also
             need a UFormField wrapper — that would just double up the label. -->
        <USwitch
          v-for="pref in notificationPrefs?.preferences ?? []"
          :key="pref.eventType"
          :model-value="pref.enabled"
          :label="pref.label"
          :description="pref.description"
          :loading="notificationPending === pref.eventType"
          @update:model-value="(value) => toggleNotification(pref.eventType, Boolean(value))"
        />

        <p class="text-sm text-muted">
          Security email can't be turned off — it covers things like sign-in links and account
          access.
        </p>
      </div>
    </UCard>

    <!-- Your data — self-serve export and deletion. The only genuinely
         destructive control on this page, so it's the only one styled that
         way; "Download your data" beside it is a plain secondary action. -->
    <UCard>
      <template #header>
        <h2 class="text-xl text-highlighted">Your data</h2>
      </template>

      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-default">Download a copy of your data</p>
            <p class="text-sm text-muted">
              One JSON file: your profile, feedback, and notification settings.
            </p>
          </div>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-download"
            :loading="exportPending"
            @click="downloadData()"
          >
            Download
          </UButton>
        </div>

        <USeparator />

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-default">Delete your account</p>
            <p class="text-sm text-muted">
              Removes your account and its contents. See the
              <!-- Underlined: a prose link distinguished by colour alone is the
                   one thing DESIGN.md › Accessibility rules out, and axe agrees
                   (link-in-text-block). -->
              <ULink to="/privacy" class="text-primary underline underline-offset-2">
                Privacy Policy </ULink
              >.
            </p>
          </div>
          <UButton color="error" variant="outline" icon="i-lucide-trash-2" @click="openDeleteModal">
            Delete account
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Delete-account confirmation. Typed-email match is the safeguard
         against a stray click — not an "are you sure?" dialog, which people
         dismiss by reflex without reading. -->
    <UModal v-model:open="deleteOpen" title="Delete your account">
      <template #body>
        <div class="flex flex-col gap-5">
          <p class="text-muted">
            This deletes your account and its contents: your notification settings. Feedback you've
            sent stays, with anything that identifies you removed from it.
          </p>
          <p class="text-muted">
            See the
            <ULink to="/privacy" class="text-primary underline underline-offset-2">
              Privacy Policy </ULink
            >. There's no undo after this.
          </p>
          <UFormField label="Type your email to confirm" name="confirm-email">
            <UInput
              v-model="confirmEmailInput"
              type="email"
              class="w-full"
              :placeholder="user?.email"
              autocomplete="off"
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex flex-wrap gap-3">
          <UButton
            color="error"
            :disabled="!canConfirmDelete"
            :loading="deletePending"
            @click="confirmDelete"
          >
            Delete my account
          </UButton>
          <UButton color="neutral" variant="ghost" @click="deleteOpen = false">
            Never mind
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
