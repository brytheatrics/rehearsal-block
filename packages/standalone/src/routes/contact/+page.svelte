<svelte:head>
  <title>Contact - Rehearsal Block</title>
  <meta name="description" content="Get in touch with the Rehearsal Block team." />
</svelte:head>

<div class="contact-page container-sm">
  <h1>Contact</h1>

  <p class="lede">
    Rehearsal Block is built and supported by Blake York at BRY Theatrics.
    For anything - support, bug reports, feature requests, refunds, press,
    partnerships - email us:
  </p>

  <p class="email-block">
    <a href="mailto:hello@rehearsalblock.com" class="email-link">
      hello@rehearsalblock.com
    </a>
  </p>

  <h2>What to include</h2>

  <p>
    To get a faster answer, include the following when relevant:
  </p>

  <ul>
    <li><strong>Bug reports</strong>: browser + OS, what you were doing when the bug happened, a screenshot if you can grab one. If you're logged in, mention the email on your account.</li>
    <li><strong>Support questions</strong>: a description of what you're trying to do and what's happening instead. Links to specific pages help.</li>
    <li><strong>Refund requests</strong>: the email address on your account and the approximate purchase date. See our <a href="/terms">refund policy</a> for eligibility.</li>
    <li><strong>Feature requests</strong>: describe the problem you're trying to solve, not just the feature. "Here's what I wanted to do and couldn't" is more useful than "add X."</li>
    <li><strong>Press and partnerships</strong>: mention the publication or organization and what you're looking for.</li>
  </ul>

  <h2>Response time</h2>

  <p>
    Rehearsal Block is a small operation - one person building and
    supporting the app alongside running theatrical productions. Most
    emails get a response within 1-3 business days. Bug reports with a
    clear reproduction get higher priority. If something is urgent and
    production-related (a show opens tomorrow and you hit a blocker),
    say so in the subject line and we'll try to look sooner.
  </p>
</div>

<style>
  .contact-page {
    padding: var(--space-6) var(--space-5);
  }

  .lede {
    font-size: 1.125rem;
    line-height: 1.6;
    color: var(--color-text);
    margin-bottom: var(--space-5);
  }

  .email-block {
    text-align: center;
    margin: var(--space-6) 0;
  }

  .email-link {
    display: inline-block;
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--color-teal-dark);
    padding: var(--space-3) var(--space-5);
    border: 2px solid var(--color-teal-dark);
    border-radius: var(--radius-md);
    text-decoration: none;
    transition: all var(--transition-fast);
  }

  .email-link:hover {
    background: var(--color-teal-dark);
    color: var(--color-text-inverse);
    text-decoration: none;
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
    margin-bottom: var(--space-3);
    line-height: 1.6;
  }

  p {
    line-height: 1.6;
  }
</style>
