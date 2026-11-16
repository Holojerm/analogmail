<!-- Sent by the letters layer (layers/letters) when a keeper asks someone to
     write to a mantel they keep for a child or a couple. Fixed wording: it
     names the keeper and the mantel and carries the link, nothing else.
     Mailed once; there is no reminder. -->
<template>
  <EmailLayout heading="{{inviterName}} asks you to write to {{mantelName}}">
    <EmailParagraph>
      <Raw>{{inviterName}}</Raw> keeps a mantel for <Raw>{{mantelName}}</Raw> on
      <Raw>{{appName}}</Raw>: a place for letters to someone who cannot keep their own yet. They
      have asked you to write to it.
    </EmailParagraph>
    <EmailParagraph>
      Letters there take days to arrive, the way post does. You can seal one until a day you
      choose, such as a birthday years from now.
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
