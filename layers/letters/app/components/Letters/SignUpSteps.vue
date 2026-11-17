<script setup lang="ts">
// One line above the four pages a new account passes through, saying how far
// along it is and, for someone who came by invitation, what the steps are for.
// The layout shows it, because two of the four pages belong to a vendored layer.
const STEPS: Record<string, number> = {
  '/auth/sign-up': 1,
  '/auth/verify-email': 2,
  '/welcome/recovery-code': 3,
  '/welcome': 4,
}

const route = useRoute()
const step = computed(() => STEPS[route.path] ?? null)

// Read in the browser only: the invitation is remembered in its storage.
const sender = ref<string | null>(null)
const read = () => {
  sender.value = step.value ? (pendingInvite()?.sender ?? null) : null
}
onMounted(read)
watch(step, read)
</script>

<template>
  <p
    v-if="step"
    class="mx-auto -mb-4 max-w-md pt-6 text-sm text-muted sm:-mb-8 sm:pt-8"
    data-testid="sign-up-steps"
  >
    Step {{ step }} of 4<template v-if="sender"
      >, to accept the invitation from {{ sender }}</template
    >
  </p>
</template>
