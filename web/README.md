# Ledger

A private budgeting app for your actual credit card transactions. The workspace starts empty: there is no sample-data generator or Sandbox mode.

- Connect credit cards using Plaid Production Link, including bank OAuth redirects.
- Sync transactions, including changes, removals, and pending-to-posted transitions.
- View per-card history, recurring-payment estimates, and spending summaries.
- Import Amex and Discover CSVs in a separate view so overlapping history is never totaled twice.
- Ask OpenAI for insights when an API key is configured; otherwise use clearly labeled instant calculations.

## Run locally

Requires Node 22.13+ (Node 24 recommended).

```sh
npm ci
cp .env.example .env
npm run build
```

Apply the SQL migrations in `drizzle/` in order. For a fresh database, start with `0000_aspiring_post.sql`. For an existing database, apply only migrations not already applied:

```sh
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_aspiring_post.sql
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_brief_black_cat.sql
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_aberrant_kylun.sql
```

Check `drizzle/` for subsequent migrations and apply those too, once each. Then run `npm run dev` and open the printed URL. The starter's loopback-only sign-in middleware supplies a local development identity. Hosted authentication is handled by the private Sites dispatcher; there is no production authentication bypass in app routes.

## Real card connections

1. Create an account at [Plaid Dashboard](https://dashboard.plaid.com/) and obtain **Production or Trial** access for the **Transactions** product. Sandbox credentials and Sandbox public tokens are deliberately rejected. Institution access depends on your plan and Plaid's current coverage; Amex uses OAuth. Check the institution's status in your Plaid Dashboard and Link.
2. Serve Ledger from an HTTPS address. Register the exact callback `https://YOUR_APP_ORIGIN/plaid/oauth` in Plaid Dashboard → Developers → API → Allowed redirect URIs. The configured callback must have the same origin as the app you use to connect. A localhost preview is sufficient for CSVs and empty-state review, but Production OAuth requires the HTTPS app.
3. Configure these **server-side** environment variables. For local development, use ignored `.env`; for hosting, configure Sites runtime secrets and redeploy. Local `.env` does not configure the hosted site.

| Variable | Value |
| --- | --- |
| `PLAID_ENV` | `production` |
| `PLAID_CLIENT_ID` | Your Plaid client ID |
| `PLAID_SECRET` | Your Production secret; store as a secret |
| `PLAID_TOKEN_ENCRYPTION_KEY` | A stable Base64-encoded 32-byte random key; store as a secret |
| `PLAID_REDIRECT_URI` | The exact allowlisted HTTPS URL ending in `/plaid/oauth` |

Generate the encryption key with `openssl rand -base64 32` and save it securely. Do not commit it or change it after linking accounts without a token re-encryption plan. Access tokens and temporary Link tokens are encrypted with AES-256-GCM and bound to their owner and connection/session ID. Tokens never go to the client. The browser stores only a temporary opaque session ID while an OAuth redirect is in progress.

4. In Ledger, select **Connect a card**, choose your institution, and complete Plaid/bank authentication yourself. Authorize the credit cards you want to see. Your bank password does not pass through Ledger.
5. Initial history can take a few minutes. Ledger requests up to 730 days, subject to institution availability. It retries initial history while open, checks every five minutes while visible, and supports **Sync**. It downloads Plaid's latest available data; it does not force a paid `/transactions/refresh` call. It does not run background jobs while the app is closed or claim webhook delivery through the private Sites sign-in gate.

One active Plaid connection per institution is supported. Multiple cards in that connection have separate account IDs. Reconnect repairs an existing connection; Disconnect revokes Plaid access and retains already downloaded history. Re-linking after a disconnect may result in new Plaid IDs; inspect overlapping retained history before using totals.

Only USD credit card transactions are included. Pending charges are visible but excluded from spending totals and recurring-payment detection. Refunds reduce spending; card payments are excluded. Recurring patterns are estimates based on similar amounts and regular timing, not confirmed subscriptions. Apple Card CSV exports are detected automatically. The first successful upload creates an Apple Card entry derived from its saved transactions; later uploads reuse it and skip matching rows. My cards combines Plaid history with Apple Card CSV imports. Amex and Discover CSV history stays in the separate CSV statements view to avoid double-counting linked-card data. Apple Card updates require another CSV upload; no Apple developer credentials are used.

## Recurring payments from CSV

Recurring analyzes the selected accounts' full history, including Apple Card CSV imports in **My cards** and other imports in **CSV statements**. Upload earlier or later statements for the same card to add billing cycles; identical re-uploads are skipped. Two similar, regularly timed charges can establish a possible pattern, with three or more providing stronger evidence.

CSV merchant descriptions that explicitly mention a subscription, membership, or recurring charge appear under **Subscriptions to review** even before a schedule is detected. These entries show recorded charges only: they have no assumed renewal date or frequency and are excluded from recurring cost estimates. When the history supports a recurring pattern, the entry moves into the detected list without being counted twice. A generic merchant name alone is not enough to identify a subscription from one charge.

## Insights

Set `OPENAI_API_KEY` as a server secret, and optionally `OPENAI_MODEL` (default `gpt-5-mini`). Without a key, deterministic spending summaries remain available and are labeled **Instant analysis**. When asking live AI, the app sends your question and a bounded spending summary to OpenAI, using the Responses API with `store: false`; it does not send bank credentials or Plaid tokens. Normal provider data policies still apply.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

Tests use synthetic fixtures only in process memory / ignored `.test-build`; they never seed the app database or call Plaid. They cover CSV parsing, amounts, recurrence, Production-only configuration, encryption, synchronization pagination, pending transitions, atomic rollback, ownership boundaries, and disconnect behavior. Real-bank login must be verified by the account owner after credentials are configured.

## Implementation

React/TypeScript, Vinext, Cloudflare Workers and D1, with private Sites hosting. APIs authenticate every request, enforce ownership in queries, and reject cross-origin mutations. Sync writes all data changes and the new cursor in one atomic D1 batch under a per-Item lease. If pagination changes mid-sync, the fetch restarts from the original cursor. There are no raw bank credentials or sample transactions in storage or production code.

Official integration references: [Transactions](https://plaid.com/docs/transactions/add-to-app/), [OAuth](https://plaid.com/docs/link/oauth/), [Sync](https://plaid.com/docs/api/products/transactions/), [OAuth access requirements](https://support.plaid.com/hc/en-us/articles/15769780649751-How-do-I-get-access-to-OAuth-institutions).
