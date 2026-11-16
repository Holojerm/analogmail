<template>
  <EmailLayout heading="The flag is up">
    <EmailParagraph>There is mail in your mailbox.</EmailParagraph>
    <EmailButton href="{{appUrl}}/mailbox">Open your mailbox</EmailButton>
    <template #footnote>
      <Raw>{{appName}}</Raw> tells you when mail arrives and nothing more: not who it is from, and
      not how much there is. Sign in to read it.
    </template>
  </EmailLayout>
</template>
