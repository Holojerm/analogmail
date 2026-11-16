<!-- Sent by the letters layer (layers/letters) when a family's organiser
     invites someone to join it. Fixed wording: it names the organiser and the
     family and carries the link, nothing else. Mailed once; no reminder. -->
<template>
  <EmailLayout heading="{{inviterName}} invites you to {{familyName}}">
    <EmailParagraph>
      <Raw>{{inviterName}}</Raw> has started <Raw>{{familyName}}</Raw> on <Raw>{{appName}}</Raw>
      and would like you in it. A letter to the family goes to everyone in it at once, each copy
      arriving by post in that person's own city.
    </EmailParagraph>
    <EmailParagraph>
      Letters take days to arrive, so nobody has to answer quickly. You will read what is written
      from the day you join.
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
