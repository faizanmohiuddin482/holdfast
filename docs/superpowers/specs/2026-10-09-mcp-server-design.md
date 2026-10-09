# Holdfast MCP server: let an AI agent hire, verify and pay

Date: 2026-10-09 · Status: draft for review

## Why

Judges score Innovation, and "AI checks the work before payment" already exists in other entries. An MCP server
lets any AI agent (Claude Desktop, Claude Code, any MCP client) act as the **client** hiring someone, or as the
**freelancer** delivering, so Holdfast becomes the trust layer for agent-to-agent and agent-to-human commerce on PayPal.

Demo: "Hire someone to build a time-conversion library for $50; release automatically if the AI scores it 90%+."
The agent drafts the checklist, hands its human one PayPal link to approve the hold, invites the freelancer,
waits for the verdict, then releases or requests changes within the human's spending policy.

## Decisions (agreed)

- Money in always needs a human: the agent returns the client page link; the human approves the PayPal hold there.
- Spending policy, set by the human in the MCP server's environment:
  `HOLDFAST_MAX_GIG_USD` (default 100) and `HOLDFAST_MIN_AUTO_RELEASE_PERCENT` (default 90).
- Freelancer tools included, so the freelancer can be an agent too.
- Local stdio server that calls Holdfast's existing HTTP API. No change to payment logic. Remote/hosted MCP: later.

## Tools

| Tool | Role | Input | Effect |
|---|---|---|---|
| `create_gig` | client | `title`, `brief`, `amount_usd`, `freelancer_paypal_email` | `POST /api/gigs`; returns the client token, the AI checklist and open questions |
| `update_checklist` | client | `client_token`, `items[{text, weight 1-5}]`, optional `answers[{question, answer}]` | `POST /api/t/{token}/draft`; answers are matched to the AI's questions by text |
| `confirm_checklist` | client | `client_token` | `POST /confirm`; returns the **pay link for the human** and the freelancer link |
| `get_gig` | either | `token` | role-safe view: status, money, next step, checklist, progress, verdict with evidence |
| `submit_work` | freelancer | `freelancer_token`, `submission` | `POST /submit`; the AI check starts |
| `request_changes` | client | `client_token`, `note` | `POST /request-changes`; money stays held |
| `release_payment` | client | `client_token` | releases **the AI's recommended %** if the policy allows; otherwise refuses and tells the agent to ask its human to approve on the client page |

Every tool returns a short sentence for the agent plus the JSON view. Failures return `isError: true` with the
API's message. `release_payment` is annotated destructive; `get_gig` read-only.

### Spending policy (enforced in the MCP server, before calling the API)

- `create_gig` refuses `amount_usd` above the max.
- `release_payment` takes no percentage: an agent can't override the AI. It proceeds only when the gig is
  `verified`, the amount is within the max, and the recommended release is at least the minimum.
  A recommendation of 0% is also allowed: it voids the hold and returns all money to the human.
  Anything else is refused with: "Outside your spending policy (…). Ask your human to review and release it at <client link>."

## Role-safe view (new, in the web app)

`GET /api/t/{token}?view=full` returns `gigView(gig, role, events, progress, origin)`, a pure function:

- Both roles: `role`, `status`, `title`, `amount_usd`, `currency`, `money` (nodes + sentence from `moneyState`),
  `next_step` (one sentence: what this role does now), `checklist` (id, text, weight), `answered_questions`,
  `progress`, `change_request`, `last_check_problem`, `change_requests_left`, `verdict`
  (`release_percent`, `release_working`, `confidence`, `summary`, `manipulation_attempt`, `items[{id, text, status, evidence, source_url}]`).
- Client only: `links.client_page` (where the human pays and can override), `links.freelancer_invite`,
  `open_questions` (unanswered AI questions), `freelancer_email`.
- Freelancer only: `links.freelancer_page`.
- **Never** includes the other role's token in a field the viewer shouldn't have: the freelancer view contains no client token or client link.
- Without `?view=full`, the endpoint keeps returning `{ status, progress }` for the page poller.

## Layout

- `src/lib/view.ts` (+ test): `gigView`, `nextStepText`.
- `src/app/api/t/[token]/route.ts`: serve the full view on `?view=full`.
- `mcp/api.mts`: tiny typed HTTP client for the Holdfast API (base URL from `HOLDFAST_URL`, default `http://localhost:3000`).
- `mcp/policy.mts` (+ test): `policyFromEnv`, `checkCreate`, `checkRelease`.
- `mcp/server.mts` (+ test): `createHoldfastMcp({ api, policy })` registers the tools; tested with the SDK's
  in-memory transport and a fake API.
- `mcp/index.mts`: stdio entry point; `npm run mcp`.
- `.mts` files run directly on Node 22.6+ (type stripping); tsconfig includes them.
- SDK: `@modelcontextprotocol/sdk` pinned to 1.30.1.

## Testing

Unit: `gigView` never leaks the client token or link to the freelancer, and `next_step` per stage × role;
`checkRelease` and `checkCreate` boundaries; each tool through an in-memory MCP client against a fake API,
including the policy refusals and the error path. Live: spawn the stdio server against the running app with the
SDK client, create a gig, confirm, read the view; the human pays; then submit, wait, and release via tools.

## Out of scope

Hosted/remote MCP (Streamable HTTP), agents paying without a human (PayPal vault / billing agreements), accounts.
