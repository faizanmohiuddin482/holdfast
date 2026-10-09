# Holdfast UX: roles, money, and visible AI

Date: 2026-10-09 · Status: draft for review

## Why

First real use showed one root problem: **you can't tell which role you are**, so you can't tell whose
money it is, where it is, or what to do next. The AI also does a lot of real work that the page never shows,
so its value is invisible. Judges score Design and Presentation, and may judge from the video alone.

Every screen must answer, from the viewer's point of view:
1. Who am I? 2. Where is the money right now? 3. What do I do next? 4. What did the AI do, and why?

## Scope

In: separate client/freelancer views via private links, money tracker, single next-step box, criteria review
before payment, live verification progress, evidence cards, formula-based release %, manipulation badge,
new visual style (calm fintech).

Out (not now): accounts/login, freelancer resubmission after feedback, MCP/agent API, hosting, dark mode.

## 1. Roles through private links

- Each gig gets two random tokens at creation: `client_token`, `freelancer_token` (24 chars, URL-safe).
- Client view: `/c/{client_token}`. Freelancer view: `/f/{freelancer_token}`. Both server-rendered.
- The old `/gigs/{id}` page is removed. Gig ids are no longer exposed in URLs.
- API routes are addressed by token, and each action checks the token's role:
  - client token: confirm criteria, create order, authorize, settle, retry payout
  - freelancer token: submit work
  - either token: read status (polling)
  A request with the wrong role's token gets 403.
- **The home page no longer lists every gig.** On a public deploy that list would let anyone open any
  client page and release money. Instead, the browser remembers gigs this person created
  (localStorage, client links only) and shows them as "Your gigs". Losing that list loses nothing on the
  server; the link itself is the key.
- Client page shows "Invite your freelancer" with the freelancer link, a copy button, and a
  "Preview as freelancer" link that opens it in a new tab (for demos and judges).

## 2. Gig stages

Adds a `draft` stage before funding so the client can review the AI's criteria.

`draft → awaiting_funding → funded → verifying → verified → settling → settled` (`failed` = captured but payout failed)

| Stage | Client's next step | Freelancer's next step |
|---|---|---|
| draft | Review criteria (edit / remove / add, answer AI's flagged questions) → **Confirm criteria** | "The client is still setting up this gig." |
| awaiting_funding | **Pay into escrow** (PayPal button) | "Waiting for the client to fund. Don't start work yet." |
| funded | **Invite your freelancer** (copy link) | **Submit your work** (description + links) |
| verifying | "The AI is checking the work" + live progress | same, worded for them |
| verified | **Review and release** (approve recommended %, or adjust) | "The client is reviewing the AI's verdict" + the verdict |
| settling | "Sending payment…" | same |
| settled | Receipt: charged, returned | Receipt: received, fee |
| failed | **Retry payout** | "Your payment is delayed; the client has been asked to retry." |

Criteria are editable only in `draft`. Once funded they are locked, and both sides see the same list.
Answers to the AI's flagged questions are saved with the gig and shown to the freelancer and to the verifier.

## 3. The page (both roles share the layout, not the content)

Top to bottom:
1. **Role pill + title**: "You're the client" / "You're the freelancer".
2. **Money tracker**: card titled "Where the money is" ("Your money" for the client). Nodes:
   Client's PayPal → Held by PayPal → Freelancer, plus "Back to client" after settlement.
   The node holding money now is highlighted; amounts shown on every node. One sentence underneath,
   in the viewer's words, e.g. client: "You haven't been charged. Nothing moves until you approve."
   freelancer: "The client's $20.00 is held by PayPal. You'll be paid when the work is approved."
   After settlement: "You were charged $2.00. $18.00 went back to your PayPal." /
   "You received $1.90 ($2.00 minus a $0.10 fee)."
3. **Next-step card**: the only place with primary buttons. Content per the table in §2.
4. **What the AI found**: evidence cards (§4), once there is a verdict.
5. **Agreed criteria**: read-only after draft.
6. **Activity**: the receipt log, collapsed by default.

Money tracker state is a pure function of the gig (`moneyState(gig, role)`), unit-tested.
Settlement amounts (`release_percent`, `capture_cents`, `payout_cents`, `fee_cents`, `returned_cents`)
are stored on the gig when settling, so the tracker and receipts never recompute history.

## 4. Visible AI

**4a. Criteria review (draft stage).** After "Create gig", the client lands on the draft page:
"The AI turned your brief into N checkable criteria" + the AI's flagged questions, each with an answer box.
Criteria rows are editable (text, weight 1-5, remove; "Add criterion").

**4b. Live verification progress.** Submitting work no longer blocks the request:
- `POST submit` validates, moves the gig to `verifying`, starts verification in the background, returns.
- Verification writes progress events as it goes: one per link fetched (with what was found:
  file count, README found, CI results, page title, or the error), then "Judging N criteria".
- Both pages poll `GET status` every 1.5 s while `verifying` and render the progress list live.
- If the server restarts mid-verification, a gig stuck in `verifying` for over 5 minutes returns to
  `funded` with a "Verification was interrupted, please resubmit" event.

**4c. Evidence cards.** One card per criterion: status icon (met ✓ / partly ◐ / not met ○ / couldn't check ?),
the criterion, the AI's evidence sentence, and the source link it came from (the AI returns the URL it relied on).

**4d. Release % from a formula, not the model.** The AI judges each criterion; the app computes:
`release% = round(100 × Σ(weight × score) / Σ weight)`, score: met 1, partly 0.5, not met 0, couldn't check 0.
The verdict shows the working, e.g. `c1 5/5 · c2 4/4 · c3 2/4 · c4 0/5 · c5 3/3 → 14/21 = 67%`.
The AI no longer returns `releasePercent`. Pure function, unit-tested.

**4e. Manipulation badge.** The verdict schema gains `manipulationAttempt` (empty, or a short quote of
text in the submission or fetched pages that tried to instruct the reviewer). If non-empty, the
verdict shows: "⚠ The submission tried to instruct the reviewer. It was ignored." with the quote.

## 5. Visual style: calm fintech

Replaces the pixel/terminal theme everywhere.
- Font: Inter (next/font), tabular numbers for money.
- Colors: page `#F6F7F9`, surface `#FFFFFF`, text `#111827`, secondary `#4B5563`, muted `#6B7280`,
  border `#E5E7EB`, primary `#1A56DB` (soft `#EEF4FF`), success `#059669`, warning `#D97706`, danger `#DC2626`.
- Cards: 12px radius, subtle shadow, 16-24px padding. Buttons: 8px radius, one primary per screen.
- Plain-language copy, sentence case, no all-caps labels.
- Light theme only. Must work at phone width (16px gutters, no horizontal scroll).

## 6. Data changes

`gigs` gains: `client_token`, `freelancer_token` (unique), `clarifications` (JSON), `release_percent`,
`capture_cents`, `payout_cents`, `fee_cents`, `returned_cents`. Added with idempotent `ALTER TABLE`
on startup. Existing local gigs without tokens get tokens generated on startup.
`events` gains event type `progress` (shown in the live list, hidden from the activity log).

## 7. Testing

Unit: `computeReleasePercent`, `moneyState` for each stage × role, role checks on token lookup,
criteria editing only in draft. Existing settlement, evidence and payout tests keep passing.
Manual: one full run in the browser per role (two tabs), on PayPal sandbox, covering a 100% pass and a
partial release, plus one submission containing a manipulation attempt.
