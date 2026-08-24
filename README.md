# Relay Rider · Green Wallet

Standalone prototype app for the Green Wallet feature: participants earn
EV Charge Credit and redeem it at a Charging Hub, subject to
administrative review.

Status: research beta / pre-pilot prototype. Not an activated payment
system. See `docs/GREEN_WALLET_SPEC.md` for the full spec, terminology
guardrails, and open founder decisions.

## Repository boundary

This repo holds the Green Wallet feature only. It is intentionally
separate from:

- `griswoldwonders/CEO-Dashboard` (now `ceo-workbench-v3`) — the
  executive tasks/agenda dashboard. Green Wallet UI does not belong there.
- `griswoldwonders/common-pathways-relay-rider` — the private
  product/engineering playbook (library, skills, reference docs, not
  application code).

## Product guardrails

- EV Charge Credit is a non-monetary program incentive (a program-defined
  unit such as "kWh credit"), not currency, a fare, or a payment
  instrument.
- Redemption always requires administrative review before it is marked
  fulfilled.
- Do not describe this feature as guaranteed transportation, live payment
  processing, or a certified emissions/carbon credit.

## Getting started

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` — start the Vite dev server.
- `npm run build` — production build.
- `npm run lint` — ESLint.
- `npm run preview` — preview the production build.

## Data model

See `src/greenWallet.js` for the `GreenWalletCredit` / `ChargingHub`
model, seed fixtures, and redemption helpers (`walletBalance`,
`requestRedemption`, `reviewRedemption`).
