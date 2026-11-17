<!-- Sent once, when an account is first made. It says the two things a new
     person most needs to hear: what to keep, and what to expect. No name in
     the greeting: at this point the account has only an email address. -->
<template>
  <EmailLayout heading="Welcome to {{appName}}">
    <EmailParagraph>Your account is ready.</EmailParagraph>
    <EmailParagraph>
      Keep two things safe: your password, and the recovery code you wrote down when you signed up.
      We hold neither. If you lose both, we can give you back your account, but nobody can open your
      letters.
    </EmailParagraph>
    <EmailParagraph>
      Letters here take days to arrive, the way post does, so nobody has to answer quickly. On a day
      something arrives you get one short email saying so, and nothing else from us.
    </EmailParagraph>
    <EmailButton href="{{appUrl}}">Open your mantel</EmailButton>
    <template #footnote>
      You're receiving this because an account was created with this email address at
      <Raw>{{appName}}</Raw>.
    </template>
  </EmailLayout>
</template>
