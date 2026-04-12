<!--
  DRAFT TERMS OF SERVICE + REFUND POLICY - NOT LAWYER REVIEWED

  This is a reasonable starting point but MUST be lawyer-reviewed (or
  replaced with a template service) before accepting real payments. The
  refund policy section is particularly load-bearing - it's the anti-abuse
  mechanism keeping refund fraud from eating into pay-once revenue.

  Sections that especially need review:
  - The EU Consumer Rights Directive Article 16(m) waiver language. The
    wording has to exactly match consumer law requirements for the waiver
    to be legally effective. Standard pattern is a required checkbox at
    checkout plus explicit acknowledgment in the terms, both of which this
    implements, but the specific phrasing should be lawyer-reviewed.
  - The refund disqualification list (export, PDF, share, conflict
    publish). These must match the `show_activity` actions that the API
    actually logs. If Phase 8 refund enforcement changes these, update.
  - The "no warranty" and "limitation of liability" sections. These are
    jurisdiction-sensitive - some jurisdictions don't allow certain
    disclaimers.
  - The governing law clause - needs to match Blake's business location.
  - The DMCA contact and process needs to comply with DMCA safe harbor
    requirements if you want to use safe harbor protections.
-->

<svelte:head>
  <title>Terms of Service - Rehearsal Block</title>
  <meta name="description" content="Terms of Service and refund policy for Rehearsal Block." />
</svelte:head>

<div class="legal-page container-sm">
  <div class="draft-banner" role="note">
    <strong>DRAFT - NOT LAWYER REVIEWED.</strong> These terms are a
    placeholder and must be reviewed by a lawyer (or replaced with a vetted
    template) before Rehearsal Block accepts real payments. The refund
    policy in particular has real enforcement behind it and must be
    legally sound.
  </div>

  <h1>Terms of Service</h1>

  <p class="meta">Last updated: 2026-04-11 (DRAFT)</p>

  <p>
    By using Rehearsal Block or purchasing access, you agree to these
    terms. If you don't agree, please don't use the service. If anything
    here is unclear, email <a href="mailto:hello@rehearsalblock.com">hello@rehearsalblock.com</a>
    before purchasing.
  </p>

  <h2>What Rehearsal Block is</h2>

  <p>
    Rehearsal Block is a web-based scheduling app for theatre directors
    and stage managers. It's sold as a one-time purchase by BRY Theatrics.
    "We" and "us" in these terms refer to BRY Theatrics.
  </p>

  <h2>Purchase and access</h2>

  <ul>
    <li>$50 one-time purchase. No subscription. No recurring fees.</li>
    <li>One account per purchase. Unlimited shows within that account.</li>
    <li>Payment is processed by Stripe. We never see your card details.</li>
    <li>After purchase, your account is marked as paid and you have immediate access.</li>
    <li>Future updates to the app are included at no extra cost.</li>
  </ul>

  <h2>Refund policy</h2>

  <p>
    <strong>7-day goodwill refund window.</strong> If you purchased
    Rehearsal Block within the last 7 days AND you have not yet used
    the service in a way that creates real value for you, you may
    request a refund by emailing
    <a href="mailto:hello@rehearsalblock.com">hello@rehearsalblock.com</a>.
  </p>

  <p>
    <strong>Refunds are void after any of the following actions:</strong>
  </p>
  <ul>
    <li>Exporting a show as JSON (downloading your data)</li>
    <li>Downloading a PDF of a show (calendar or contact sheet)</li>
    <li>Publishing a share link or collecting conflicts (sending your show out to cast/crew)</li>
  </ul>
  <p>
    This is enforced by our audit log. If any of these actions exist on
    your account, the refund request will be declined. The reasoning: if
    you've exported your show data or distributed it to others, you've
    received the core value of the product.
  </p>

  <p>
    <strong>A successful refund triggers automatic account deletion.</strong>
    When we refund you, your account is permanently deleted along with all
    shows and data. You will not be able to sign in again with the same
    email address (Stripe Radar automatically blocks previously-refunded
    emails from repurchasing).
  </p>

  <h2>EU consumer rights waiver (Article 16(m))</h2>

  <p>
    When you purchase Rehearsal Block, you will be asked to tick a
    checkbox acknowledging that you want immediate access to the service
    and that you understand this waives your right to withdraw under the
    EU Consumer Rights Directive Article 16(m).
  </p>

  <p>
    By ticking this checkbox and completing the purchase, you expressly
    consent to immediate performance of the contract and acknowledge that
    you lose your automatic 14-day cancellation right. The 7-day goodwill
    refund window above still applies.
  </p>

  <h2>Your account and your data</h2>

  <ul>
    <li>You are responsible for keeping your account credentials secure.</li>
    <li>You own the content you create (show schedules, cast lists, notes, everything you put into the app). We don't claim any rights over it.</li>
    <li>You can export everything as JSON at any time. If we go out of business or the service becomes unavailable, your local (browser) copy continues to work and you can download your data.</li>
    <li>Don't upload copyrighted material you don't have rights to. Don't upload content that's illegal, harmful, or violates anyone else's rights.</li>
    <li>We reserve the right to suspend accounts that abuse the service (spamming share links, overwhelming our servers, etc.).</li>
  </ul>

  <h2>Availability and "no warranty"</h2>

  <p>
    Rehearsal Block is provided <strong>as-is, with no warranty</strong>.
    We don't guarantee uptime or that the service will be available when
    you need it. We aim for high reliability but we don't offer an SLA,
    uptime commitment, or production-level support at the $50 price point.
  </p>

  <p>
    Because the app is local-first (your data lives on your device in
    IndexedDB), the service remaining online matters less than it would
    for a typical SaaS: even during an outage, you can still open, edit,
    and export your existing shows from the device you last used. We
    recommend exporting important shows to JSON periodically as a backup.
  </p>

  <h2>Limitation of liability</h2>

  <p>
    We are not liable for any indirect, incidental, consequential, or
    punitive damages arising from your use of Rehearsal Block. Our total
    liability to you, for any claim related to the service, is limited
    to the amount you paid us (typically $50).
  </p>

  <p>
    Specifically: we are not responsible for data loss. Always keep local
    backups via the Export to JSON feature. If we accidentally delete a
    show or our cloud backup becomes unavailable, your IndexedDB copy is
    your recovery path.
  </p>

  <h2>DMCA / copyright complaints</h2>

  <p>
    If you believe content on Rehearsal Block infringes your copyright,
    email <a href="mailto:hello@rehearsalblock.com">hello@rehearsalblock.com</a>
    with: (1) identification of the copyrighted work, (2) identification
    of the infringing material including a URL or enough detail to locate
    it, (3) your contact information, (4) a statement that you have a
    good-faith belief the use is not authorized, and (5) a statement under
    penalty of perjury that you are authorized to act on behalf of the
    rights holder.
  </p>

  <h2>Changes to these terms</h2>

  <p>
    We may update these terms from time to time. If we make material
    changes, we'll notify active paid users by email and update the "last
    updated" date at the top of this page. Small clarifications and typo
    fixes don't trigger notifications.
  </p>

  <h2>Governing law</h2>

  <p>
    These terms are governed by the laws of the United States and the
    state in which BRY Theatrics is based. Any disputes will be resolved
    in that jurisdiction unless consumer protection law in your country
    requires otherwise.
  </p>

  <h2>Contact</h2>

  <p>
    Questions about these terms? Email
    <a href="mailto:hello@rehearsalblock.com">hello@rehearsalblock.com</a>.
  </p>
</div>

<style>
  .legal-page {
    padding: var(--space-6) var(--space-5);
  }

  .draft-banner {
    background: var(--color-warning-bg);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-5);
    color: #7a4a00;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .meta {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin-bottom: var(--space-5);
  }

  h2 {
    margin-top: var(--space-6);
    margin-bottom: var(--space-3);
    font-size: 1.5rem;
  }

  ul {
    margin: 0 0 var(--space-4) 0;
    padding-left: var(--space-5);
  }

  li {
    margin-bottom: var(--space-2);
    line-height: 1.6;
  }

  p {
    line-height: 1.6;
  }
</style>
