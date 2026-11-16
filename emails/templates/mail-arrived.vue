<template>
  <EmailLayout heading="Something arrived on your mantel">
    <EmailParagraph>Sign in to open your mantel.</EmailParagraph>
    <EmailButton href="{{appUrl}}/mantel">Open your mantel</EmailButton>
    <template #footnote>
      <Raw>{{appName}}</Raw> tells you when something arrives and nothing more: not who it is from, and
      not how much there is. Sign in to read it.
    </template>
  </EmailLayout>
</template>
