# Holdfast

**Escrow for freelance work, released by an AI agent that actually checks the deliverable.**

Paying a freelancer upfront is risky for the client, and working without payment is risky for the freelancer.
Escrow platforms solve this, but release still comes down to someone saying "looks good". On a disputed job
that means days of back-and-forth. Holdfast holds the client's money with PayPal. When the work comes in, an
AI agent opens the deliverable, checks it against criteria both sides could see from the start, and
recommends how much to release: all, part, or none.

## How it works

1. **Agree.** The client describes the job. The AI turns it into a weighted checklist and flags unclear points.
   The client edits the checklist and answers the questions before paying anything.
2. **Hold.** The client pays through PayPal Checkout with `intent: AUTHORIZE`. PayPal holds the money; nothing is captured.
3. **Invite.** The client sends the freelancer their own link. Each side has a private link and sees only their own
   next step, plus a money tracker that shows where the money is right now.
4. **Check.** The freelancer submits links. Holdfast opens them (GitHub repos through the GitHub API, including CI results;
   other pages as text, with SSRF guards) and both pages show the progress live. Gemini judges each checklist item
   with evidence and the source link; text that tries to instruct the reviewer is flagged and ignored.
5. **Release.** The app computes the release % from the item weights (met = full, partly met = half), shows the working,
   and the client approves or adjusts it. PayPal captures that share (the rest goes back automatically) or voids the hold
   at 0%, then pays the freelancer through Payouts, minus a platform fee.

   With `HOLDFAST_AUTO_RELEASE=true`, a 100% verdict with high confidence is settled by the agent with no
   client step. That is the agentic-commerce mode.

## PayPal APIs used

| Step | API |
|---|---|
| Fund | JS SDK Buttons + Orders v2 `POST /v2/checkout/orders` (`intent: AUTHORIZE`) |
| Hold | Orders v2 `POST /v2/checkout/orders/{id}/authorize` |
| Release (full or partial) | Payments v2 `POST /v2/payments/authorizations/{id}/capture` |
| Refund on rejection | Payments v2 `POST /v2/payments/authorizations/{id}/void` |
| Pay freelancer | Payouts v1 `POST /v1/payments/payouts` |

Every money-moving call sends a deterministic `PayPal-Request-Id`, so retries can't double-capture or double-pay.

## AI tools used

- **Google Gemini** (Flash, free tier; set `GEMINI_MODEL` to change it) through the `@google/genai` SDK.
  - Drafts acceptance criteria from the brief.
  - Judges the deliverable against them using the fetched pages as evidence.
  - Both calls use JSON-schema structured output generated from Zod schemas, and every answer is validated
    again with Zod, so the app never parses free text.

## Run it locally

Requires Node 22.5+ (uses the built-in `node:sqlite`).

1. Create a PayPal sandbox app at [developer.paypal.com](https://developer.paypal.com) → Apps & Credentials → Sandbox.
   In the sandbox accounts list you'll have a **personal** account (use it to pay as the client) and a
   **business** account (the platform). Create a second personal account for the freelancer and use its email
   when you create a gig. Use sandbox accounts registered in the **US**: PayPal doesn't process payments within
   India, and Indian sandbox accounts fail at checkout with "Things don't appear to be working at the moment".
2. Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com) → Get API key.
3. Set up and start the app:

   ```bash
   npm install
   cp .env.example .env.local   # fill in the keys
   npm run dev                  # http://localhost:3000
   ```

4. Create a gig, fund it with the sandbox personal account, submit work (a public GitHub repo or
   deployed URL works best), then approve the release. Check the freelancer's sandbox account for the payout.

```bash
npm test     # settlement math
npm run build
```

## Limits (it's a hackathon build)

- No accounts. Each gig has a private client link and a private freelancer link; whoever holds a link acts as that role.
  The home page lists only gigs created in the current browser.
- Authorizations last 29 days with a 3-day honor period. Long gigs would need PayPal reauthorization.
- If the capture succeeds but the payout fails, the gig is parked as "Needs attention" rather than retried
  automatically, so money is never moved twice.

## License

MIT
