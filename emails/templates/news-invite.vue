<!-- Sent by the letters layer (layers/letters) when a keeper of a child's
     mantel asks someone to read the child's news. Fixed wording: it names the
     keeper and the child and carries the link, nothing else. Mailed once;
     there is no reminder. -->
<template>
  <EmailLayout heading="{{inviterName}} would like to send you news of {{mantelName}}">
    <EmailParagraph>
      <Raw>{{inviterName}}</Raw> keeps a mantel for <Raw>{{mantelName}}</Raw> on
      <Raw>{{appName}}</Raw>, and now and then writes a letter of news: a photo, a first word, a
      birthday. They would like you to be one of the people who gets it.
    </EmailParagraph>
    <EmailParagraph>
      News comes as a letter, a few days after it is written. It is encrypted, so only the people
      it is sent to can read it. You can stop getting it whenever you like.
    </EmailParagraph>
    <EmailButton href="{{url}}">See the invitation</EmailButton>
    <template #footnote>
      Button not working? Paste this into your browser: <Raw>{{url}}</Raw>
      <br /><br />
      The invitation is good for <Raw>{{expiresDays}}</Raw> days. If you don't know
      <Raw>{{inviterName}}</Raw>, ignore this email: nothing more will be sent, and your address is
      deleted when the invitation expires.
    </template>
  </EmailLayout>
</template>
