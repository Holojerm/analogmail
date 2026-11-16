<script setup lang="ts">
// Upkeep: everything that is not one of the four places. One button at the
// right of the header at every width. DESIGN.md › The house.
const { user } = useUserSession()
const { signOut } = useSignOut()

const items = computed(() => [
  [{ label: user.value?.email ?? '', type: 'label' as const }],
  [
    { label: 'Your post', icon: 'i-lucide-calendar-days', to: '/settings/post' },
    { label: 'Mantels you keep', icon: 'i-lucide-key-round', to: '/mantels' },
    { label: 'Keep a copy', icon: 'i-lucide-download', to: '/archive' },
    { label: 'Account', icon: 'i-lucide-user', to: '/account' },
    ...(user.value?.role === 'admin'
      ? [{ label: 'Admin', icon: 'i-lucide-shield', to: '/admin' }]
      : []),
  ],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: signOut }],
])
</script>

<template>
  <UDropdownMenu :items="items" :ui="{ content: 'w-56' }">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-menu"
      aria-label="Menu"
      class="min-touch"
    />
  </UDropdownMenu>
</template>
