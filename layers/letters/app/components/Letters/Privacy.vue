<script setup lang="ts">
// The part of the privacy page that is about letters. It says what the
// encryption does and, as plainly, what it does not.
</script>

<template>
  <section class="flex flex-col gap-3">
    <h2 class="text-2xl text-highlighted">Your letters</h2>
    <p>
      <strong class="text-highlighted">We cannot read them.</strong> A letter is encrypted in your
      browser before it is saved, under a key made for that letter. That key is wrapped to your
      public key and to your correspondent's, and to no one else's. Our servers store the result and
      hold nothing that opens it: not the text, not the paper and ink you chose, not the name you
      signed. A photo is made smaller in your browser, which also removes where and when it was
      taken, and is encrypted under the same key with your description of it.
    </p>
    <p>
      <strong class="text-highlighted">What we do see.</strong> Who writes to whom, when a letter
      was sealed, and when it is due to arrive, because the post cannot run without them. We can see
      roughly how long a letter is, whether it has a photo, and the size of that file. We also keep
      the city you chose, your mail days and your delivery hour. We store the city, never your
      location.
    </p>
    <p>
      <strong class="text-highlighted">Your keys.</strong> Your private key is made on your device.
      We keep copies of it locked under your password, your passkeys and your recovery code, none of
      which we have. If you lose all of those, we can restore your account by email, but nobody can
      restore the letters.
    </p>
    <p>
      <strong class="text-highlighted">What this does not protect against.</strong> It protects your
      letters from a leak of our database, from our backups and from anyone browsing our tables. It
      does not protect you from us shipping altered code to your browser, and we do not yet offer a
      way to check that the public key we hand you is really your correspondent's. The source is
      public so the first can be checked.
    </p>
    <p>
      <strong class="text-highlighted">Invitations.</strong> When you invite someone, we send one
      email to the address you give and keep that address until they accept or 30 days pass, then
      delete it.
    </p>
    <p>
      <strong class="text-highlighted">No receipts.</strong> We record when a letter is delivered
      and first opened so your own mantel can show it. That is never shown to the person who wrote
      to you, or to anyone else.
    </p>
    <p>
      <strong class="text-highlighted">A letter belongs to whoever received it.</strong> If you
      delete your account, the letters you received, your drafts and your settings are deleted.
      Letters you sent stay with the people you sent them to.
    </p>
  </section>
</template>
