<script setup lang="ts">
// One customer record — the page a support conversation actually happens on.
//
// Everything on it comes from GET /api/admin/users/:id, which is audited as a
// single privileged read.
//
// `middleware: 'auth'` is a UX guard only. requireAdmin() inside every endpoint
// is the boundary; a non-admin who reaches this URL gets the 403 state below.

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const userId = computed(() => String(route.params.id))

const {
  data: response,
  error,
  status,
} = await useFetch(() => `/api/admin/users/${userId.value}`, {
  key: `admin-user-${route.params.id}`,
})

const data = computed(() => response.value)

const forbidden = computed(() => isForbidden(error.value))
const missing = computed(() => error.value?.statusCode === 404)

/** Attribution columns, rendered only where there is something to render. */
const attribution = computed(() => {
  const user = data.value?.user
  if (!user) return []
  return [
    { label: 'Source', value: user.signupSource },
    { label: 'Medium', value: user.signupMedium },
    { label: 'Campaign', value: user.signupCampaign },
    { label: 'Referrer', value: user.signupReferrer },
  ].filter((row) => Boolean(row.value))
})

useSeo({
  title: 'Customer record',
  description: 'Internal support view of one customer account and feedback.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-8 py-12">
    <ULink to="/admin" class="flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-arrow-left" />
      Back to search
    </ULink>

    <!-- Identity, and the page's only level-1 heading.
         Hoisted above every conditional below on purpose: when it lived inside
         the `data` branch, the 403, 404, and loading states rendered a page
         with no level-1 heading at all — an axe `page-has-heading-one` failure
         and, more to the point, a screen reader landing on a document that
         never says what it is. The subject's address is the heading once it
         loads; before that the heading still exists and names the page.
         (Keep the tag name out of this comment — seo:check counts heading tags
         in raw template text, HTML comments included.) -->
    <div class="flex flex-wrap items-center gap-4">
      <UAvatar
        v-if="data"
        :src="data.user.avatarUrl ?? undefined"
        :alt="`${data.user.name}'s avatar`"
        size="lg"
      />
      <div class="min-w-0">
        <h1 class="truncate text-2xl text-highlighted" :class="{ 'font-mono': data }">
          {{ data?.user.email ?? 'Customer record' }}
        </h1>
        <p v-if="data" class="mt-1 text-muted">{{ data.user.name }}</p>
      </div>
      <div v-if="data" class="ml-auto flex flex-wrap gap-2">
        <UBadge
          v-if="data.user.role === 'admin'"
          color="warning"
          variant="subtle"
          icon="i-lucide-shield"
        >
          admin
        </UBadge>
        <UBadge :color="accessBadge.color" variant="subtle" :icon="accessBadge.icon">
          {{ accessBadge.label }}
        </UBadge>
      </div>
    </div>

    <UAlert
      v-if="forbidden"
      color="error"
      variant="subtle"
      icon="i-lucide-lock"
      :title="ADMIN_FORBIDDEN.title"
      :description="ADMIN_FORBIDDEN.description"
    />

    <UAlert
      v-else-if="missing"
      color="warning"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="No such customer"
      description="That account id doesn't exist. It may have been deleted."
    />

    <template v-else>
      <div v-if="status === 'pending'" class="flex flex-col gap-3">
        <USkeleton class="h-4 w-64" />
        <USkeleton class="h-4 w-48" />
      </div>

      <template v-else-if="data">
        <UCard>
          <template #header>
            <h2 class="text-xl text-highlighted">Account</h2>
          </template>

          <dl class="grid gap-4 sm:grid-cols-2">
            <div>
              <dt class="text-sm text-muted">Joined</dt>
              <dd class="font-mono text-default">{{ formatDay(data.user.createdAt) }}</dd>
            </div>
            <div>
              <dt class="text-sm text-muted">Last sign-in</dt>
              <dd class="font-mono text-default">{{ formatDateTime(data.user.lastLoginAt) }}</dd>
            </div>
            <div>
              <dt class="text-sm text-muted">Signed up with</dt>
              <dd class="text-default">{{ data.user.provider ?? 'unknown' }}</dd>
            </div>
          </dl>

          <template v-if="attribution.length" #footer>
            <div class="flex flex-col gap-2">
              <p class="text-sm text-muted">
                First-touch attribution, written once at signup and never overwritten.
              </p>
              <dl class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div v-for="row in attribution" :key="row.label" class="flex gap-2">
                  <dt class="text-muted">{{ row.label }}</dt>
                  <dd class="font-mono text-default">{{ row.value }}</dd>
                </div>
              </dl>
            </div>
          </template>
        </UCard>

        <!-- What they've told us — from the feedback layer; absent without it. -->
        <FeedbackAdminUserCard v-if="data.feedback" :items="data.feedback" />

        <!-- Audit trail -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-history" class="text-muted" />
              <h2 class="text-xl text-highlighted">What we've done to this account</h2>
            </div>
          </template>

          <p v-if="!data.audit.length" class="text-muted">
            Nothing has been done to this account through the console.
          </p>

          <ul v-else class="flex flex-col divide-y divide-default">
            <li v-for="entry in data.audit" :key="entry.id" class="flex gap-3 py-3 first:pt-0">
              <UIcon :name="auditActionIcon(entry.action)" class="mt-1 shrink-0 text-muted" />
              <div class="min-w-0 flex-1">
                <p class="text-default">{{ auditActionLabel(entry.action) }}</p>
                <p class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                  <span class="font-mono">{{ formatDateTime(entry.createdAt) }}</span>
                  <span
                    v-for="pair in metadataPairs(entry.metadata)"
                    :key="pair.key"
                    class="font-mono"
                  >
                    {{ pair.key }}: {{ pair.value }}
                  </span>
                </p>
              </div>
            </li>
          </ul>

          <template #footer>
            <p class="text-sm text-muted">
              Append-only. Rows are written before the action they describe, so an action that
              failed halfway still leaves a record of what was attempted.
            </p>
          </template>
        </UCard>
      </template>
    </template>
  </div>
</template>
