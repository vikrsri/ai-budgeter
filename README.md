# AI Budgeter — Ledger

Ledger combines real credit card transactions, recurring-payment detection, and spending insights. Connect cards through Plaid Production, or import CSV statements. The app starts empty and contains no sample-data fallback.

The application is in [`web/`](web/). See the [setup guide](web/README.md) for local development, Plaid Production credentials and OAuth configuration, database migrations, and optional OpenAI integration.

```sh
cd web
npm ci
npm run dev
```

Real bank linking requires your own Plaid Production or Trial account and an allowlisted HTTPS app URL. No cards are connected until you complete Plaid Link yourself.
