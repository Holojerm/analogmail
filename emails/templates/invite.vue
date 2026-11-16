<!-- Sent by the letters layer (layers/letters) when someone invites a friend to
     correspond. Fixed wording: it names the sender and carries the link, and
     nothing the sender wrote. Mailed once; there is no reminder. -->
<template>
  <EmailLayout heading="{{inviterName}} would like to write to you">
    <EmailParagraph>
      <Raw>{{inviterName}}</Raw> has invited you to exchange letters on <Raw>{{appName}}</Raw>.
      Letters there take days to arrive, the way post does, so nobody has to answer quickly.
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
