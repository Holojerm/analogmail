<script setup lang="ts">
// The part of the privacy page that is about the family room. It is the one
// place in the app that is not end-to-end encrypted, and it says so.
</script>

<template>
  <section class="flex flex-col gap-3">
    <h2 class="text-2xl text-highlighted">The family room</h2>
    <p>
      <strong class="text-highlighted">It is not encrypted like your letters.</strong> A family room
      holds photos that everyone in the family can see. They are stored so that our servers could
      read them, because a shared album is shown to people whose keys we never hold. Nothing from a
      letter is ever copied into a room, and the room cannot read your letters.
    </p>
    <p>
      <strong class="text-highlighted">What we keep.</strong> Each photo, a smaller copy of it, its
      caption, who added it and when. Photos are made smaller in your browser before they are sent,
      which also removes where and when they were taken. Only people in the family can open a photo,
      and each request is checked.
    </p>
    <p>
      <strong class="text-highlighted">Where you are.</strong> A room can show which city each
      person says they are in. It is a city you pick from a list, shown to that family only, and you
      can take it back. We never read your device's location, and nobody is reminded to update it.
      The map of those cities is drawn on our own servers, so no outside map service learns where a
      family lives.
    </p>
    <p>
      <strong class="text-highlighted">Removing photos.</strong> Whoever added a photo can delete
      it, and so can the family's organiser. If you leave a family, the photos you added stay with
      it unless you delete them first. If you delete your account, every photo you added is deleted
      with it.
    </p>
  </section>
</template>
