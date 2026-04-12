<!--
  DRAFT PRIVACY POLICY - NOT LAWYER REVIEWED

  This is a reasonable starting point that covers the major sections a
  privacy policy for a one-time-purchase SaaS in the US/EU needs, but
  Blake MUST have this reviewed by a lawyer OR run through a legitimate
  template service (TermsFeed, Termly, Iubenda) before accepting real
  payments in production.

  Sections that especially need review:
  - The "what we collect" list must match whatever is ACTUALLY being
    tracked at launch time. If Phase 9 analytics changes this, update.
  - The data retention windows (30 days for analytics, etc.) must match
    the actual cron job retention logic.
  - EU GDPR rights language is mostly boilerplate but needs verification
    for the specific jurisdictions Blake sells into.
  - The "legal basis" section is GDPR-specific and should be lawyer-
    reviewed.
  - Last updated date needs to reflect the actual date of any content
    change.
-->

<svelte:head>
  <title>Privacy Policy - Rehearsal Block</title>
  <meta name="description" content="How Rehearsal Block collects, uses, and protects your data." />
</svelte:head>

<div class="legal-page container-sm">
  <!--
    Draft banner only renders during local dev (pnpm dev). Vite replaces
    import.meta.env.DEV with a literal at build time, so the entire block
    becomes dead code and is tree-shaken out of the prerendered privacy.html.
    On Netlify production deploys, this banner does not exist in the served
    HTML at all.
  -->
  {#if import.meta.env.DEV}
    <div class="draft-banner" role="note">
      <strong>DRAFT - NOT LAWYER REVIEWED.</strong> This privacy policy is a
      placeholder and must be reviewed by a lawyer (or replaced with a vetted
      template) before Rehearsal Block accepts real payments.
    </div>
  {/if}

  <h1>Privacy Policy</h1>

  <p class="meta">Last updated: 2026-04-11</p>

  <p>
    Rehearsal Block is a scheduling app sold by BRY Theatrics as a one-time
    purchase. This policy explains what data we collect, why, and what you
    can do about it.
  </p>

  <h2>TL;DR</h2>

  <ul>
    <li>Your show data lives primarily on your own device (local-first). We keep a backup copy in encrypted cloud storage so you can access it from other devices.</li>
    <li>We collect anonymous usage stats on public marketing pages only (how many people visit, how long they try the demo). We do NOT track anything inside the paid app.</li>
    <li>We don't sell your data. We don't run ads. We don't share your schedules with anyone.</li>
    <li>You can export or delete everything at any time.</li>
  </ul>

  <h2>What we collect</h2>

  <h3>On public marketing pages (rehearsalblock.com/, /demo, etc.)</h3>
  <p>
    We log page visits and demo session duration to understand how many
    people are trying the product. Each visit is associated with a one-way
    hash of your IP address + user agent + a rotating daily salt. This
    hash is not reversible - we cannot use it to identify you personally,
    and it changes every day.
  </p>
  <p>
    We do NOT set tracking cookies, use third-party analytics, or fingerprint
    your browser.
  </p>

  <h3>When you sign up and buy</h3>
  <p>
    If you purchase Rehearsal Block, we create an account tied to your
    email address. Your payment is processed by Stripe, which collects
    your billing details directly. We never see or store your credit card
    information - Stripe sends us a confirmation and a customer ID.
  </p>

  <h3>While you use the paid app</h3>
  <p>
    Your rehearsal schedules (cast lists, call times, conflicts, notes)
    are stored on your device first (in IndexedDB) and synced to cloud
    storage for backup and multi-device access. We store:
  </p>
  <ul>
    <li>Your show documents (gzipped JSON) in Cloudflare R2 storage</li>
    <li>Metadata about your shows (name, dates, timestamps) in Supabase Postgres</li>
    <li>An audit log of actions you take (created, exported, published) for refund eligibility and abuse prevention</li>
  </ul>
  <p>
    We do NOT collect usage analytics, page views, interaction tracking,
    or session recordings inside the paid app.
  </p>

  <h2>Third-party services</h2>

  <p>We use these services to run Rehearsal Block:</p>

  <ul>
    <li><strong>Stripe</strong> - payment processing. Your card details go to Stripe, not to us. <a href="https://stripe.com/privacy" target="_blank" rel="noopener">Stripe privacy policy</a></li>
    <li><strong>Supabase</strong> - authentication and small metadata database. <a href="https://supabase.com/privacy" target="_blank" rel="noopener">Supabase privacy policy</a></li>
    <li><strong>Cloudflare R2</strong> - storage for your show documents. <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener">Cloudflare privacy policy</a></li>
    <li><strong>Netlify</strong> - hosting for the website and app. <a href="https://www.netlify.com/privacy/" target="_blank" rel="noopener">Netlify privacy policy</a></li>
    <li><strong>Sentry</strong> - error reporting so we can fix bugs. Sentry receives minimal context: stack traces and the URL path where an error occurred. <a href="https://sentry.io/privacy/" target="_blank" rel="noopener">Sentry privacy policy</a></li>
  </ul>

  <h2>Your rights</h2>

  <p>You can, at any time:</p>

  <ul>
    <li><strong>Export everything</strong> - download your show data as JSON files from inside the app</li>
    <li><strong>Delete your account</strong> - removes all your shows, metadata, and the account itself. This is irreversible.</li>
    <li><strong>Request access to data we hold</strong> - email us and we'll provide a copy</li>
    <li><strong>Correct data</strong> - you can edit everything yourself in the app; for account info, email us</li>
  </ul>

  <p>
    If you are in the EU/UK, you also have rights under GDPR including the
    right to object to processing and the right to lodge a complaint with
    your local data protection authority.
  </p>

  <h2>Data retention</h2>

  <ul>
    <li>Show data: kept until you delete it or delete your account</li>
    <li>Analytics on public pages: 30 days, then aggregated into daily summaries and rows deleted</li>
    <li>Backups: rolling 30 daily / 12 monthly / 3 yearly</li>
    <li>Payment records: retained per legal requirements (typically 7 years for tax purposes)</li>
  </ul>

  <h2>Children's privacy</h2>

  <p>
    Rehearsal Block is not directed at children under 13. If you're a
    stage manager or director working with minors on a production, the
    app only stores information you explicitly enter about them (names,
    contact info if you add it) and only for scheduling purposes. Do not
    enter more personal data than you need.
  </p>

  <h2>Changes to this policy</h2>

  <p>
    If we change this policy materially, we'll update the "last updated"
    date at the top and send an email to active paid users describing the
    change. Small clarifications and typo fixes don't trigger notifications.
  </p>

  <h2>Contact</h2>

  <p>
    Questions about privacy? Email <a href="mailto:hello@rehearsalblock.com">hello@rehearsalblock.com</a>.
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

  h3 {
    margin-top: var(--space-4);
    margin-bottom: var(--space-2);
    font-size: 1.125rem;
    color: var(--color-plum-light);
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
