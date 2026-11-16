<script setup lang="ts">
// The moment a letter is sealed: its stamp lands, and it goes into the
// postbox. It lasts SEND_OFF_MS and then the page moves on to the desk.
// Whoever has motion turned down never sees it (useSendOff).
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-default" role="status">
    <div class="flex flex-col items-center">
      <ArtEnvelope stamped class="send-envelope relative z-10 w-40" />
      <ArtPostbox class="send-box -mt-2 h-44" />
      <p class="mt-8 font-display text-2xl text-highlighted">Sealed. Off it goes.</p>
    </div>
  </div>
</template>

<style scoped>
.send-envelope {
  --stamp-delay: 350ms;
  animation:
    pop 420ms var(--ease-spring) both,
    post-away 700ms 950ms cubic-bezier(0.5, 0, 0.8, 0.4) forwards;
}
.send-box {
  transform-origin: 50% 100%;
  animation: wiggle 450ms 1550ms ease-in-out;
}
</style>
