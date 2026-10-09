# Holdfast

**Escrow for freelance work, released by an AI agent that actually checks the deliverable.**

Paying a freelancer upfront is risky for the client, and working without payment is risky for the freelancer.
Escrow platforms solve this, but release still comes down to someone saying "looks good". On a disputed job
that means days of back-and-forth. Holdfast holds the client's money with PayPal. When the work comes in, a
Claude agent opens the deliverable, checks it against criteria both sides could see from the start, and
recommends how much to release: all, part, or none.

## How it works

1. **Brief → criteria.** The client describes the gig. The agent turns the brief into 3-8 objectively
   checkable acceptance criteria and flags any ambiguities *before* money is committed.
2. **Hold, don't pay.** The client funds via PayPal Checkout with `intent: AUTHORIZE`. PayPal places a hold;
   nothing is captured.
3. **Deliver.** The freelancer submits a description plus links (repo, deployed site, docs).
4. **Verify.** The agent uses Claude's `web_fetch` tool to open the links and judges each criterion
   (`met`, `partially_met`, `not_met`, `cannot_verify`) with evidence. It returns a weighted release
   percentage, feedback for the freelancer and, if it recommends less than 100%, a neutral dispute summary.
   The submission is treated as untrusted input, so instructions embedded in it are ignored.
5. **Settle.** The client approves the agent's percentage or overrides it. Overrides are logged. Holdfast then:
   - **captures** that share of the authorization (`final_capture: true`, so the rest goes back to the client
     automatically), or **voids** the hold at 0%;
   - **pays the freelancer** through PayPal Payouts, minus a platform fee.

   With `HOLDFAST_AUTO_RELEASE=true`, a 100% verdict with high confidence is settled by the agent with no
   client step. That is the agentic-commerce mode.

Every step is written to an activity log on the gig page.

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

- **Claude Opus 5.5** (`claude-opus-5-5`) through the Anthropic TypeScript SDK.
  - Structured outputs (Zod schemas) for both the criteria and the verdict, so the app never parses free text.
  - Server-side `web_fetch` tool so the agent inspects the real deliverable instead of trusting the
    freelancer's description.
  - Server-side refusal fallback (`fallbacks: "default"`).

## Run it locally

Requires Node 22.5+ (uses the built-in `node:sqlite`).

1. Create a PayPal sandbox app at [developer.paypal.com](https://developer.paypal.com) → Apps & Credentials → Sandbox.
   In the sandbox accounts list you'll have a **personal** account (use it to pay as the client) and a
   **business** account (the platform). Create a second personal account for the freelancer and use its email
   when you create a gig.
2. Get a Claude API key at [console.anthropic.com](https://console.anthropic.com).
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

- No accounts or auth. Client and freelancer actions share one page, labelled by role.
- Authorizations last 29 days with a 3-day honor period. Long gigs would need PayPal reauthorization.
- If the capture succeeds but the payout fails, the gig is parked as "Needs attention" rather than retried
  automatically, so money is never moved twice.

## License

MIT
