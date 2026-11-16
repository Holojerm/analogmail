<!-- Sent by the keys layer (layers/keys) to every keeper of a mantel when its
     recovery code is used by someone who does not keep it. Fixed wording. It
     names the mantel and the day the claim would stand, and nothing about
     who used the code: the keepers see that on the mantel's page. -->
<template>
  <EmailLayout heading="The recovery code for {{mantelName}} was used">
    <EmailParagraph>
      Someone used the printed recovery code of the mantel you keep for
      <Raw>{{mantelName}}</Raw> and has asked to become one of its keepers.
    </EmailParagraph>
    <EmailParagraph>
      If nothing is done, they become a keeper on <Raw>{{readyDate}}</Raw>. If you expected this,
      there is nothing to do. If you did not, cancel it before then: any keeper can.
    </EmailParagraph>
    <EmailButton href="{{url}}">Open the mantel</EmailButton>
    <template #footnote>
      Button not working? Paste this into your browser: <Raw>{{url}}</Raw>
      <br /><br />
      The code is the one shown when the mantel was opened. If it may have been copied by someone
      it was not meant for, cancel this and tell the other keepers.
    </template>
  </EmailLayout>
</template>
