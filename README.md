# Relay Rider · Green Wallet

Standalone **reference client** for the Green Wallet participant experience.
It mirrors the canonical Green Wallet contract owned by
`griswoldwonders/relay-rider-beta-001`; it does not define an independent
backend, persistence model, payment system, or Charging Intelligence domain.

Status: research beta / pre-pilot prototype. All local fixtures are synthetic
and non-authoritative. See `docs/GREEN_WALLET_SPEC.md` for the mirrored
contract, terminology guardrails, and open founder decisions.

## Repository boundary

Canonical Green Wallet persistence and business semantics live in the Relay
Rider Django backend. This repository is limited to participant-facing UX,
synthetic fixtures, and contract regression tests.

It remains intentionally separate from:

- `griswoldwonders/CEO-Dashboard` (now `ceo-workbench-v3`) — executive tasks
  and agenda workflows.
- `griswoldwonders/common-pathways-relay-rider` — private product and
  engineering playbook/reference material.

## Product guardrails

- Green Route Credits are program-defined promotional or
  institution-sponsored participation benefits, not currency, fares, wages,
  guaranteed payments, direct charging reimbursement, or a payment
  instrument.
- Credit issuance and redemption requests are separate records.
- Redemption follows the canonical lifecycle
  `requested → under-review → fulfilled|denied` and requires administrative
  review before fulfillment.
- Charging Hub status machine values are `candidate`, `verified`, and `active`.
- This prototype does not guarantee charger availability, process payments,
  start charging sessions, or connect to a live charging network.
- It does not contain ChargingStation, EVSE, ChargingSession,
  CreditEligibilityEvent, ProgramBudgetLedger, DecisionCard, or other
  Charging Intelligence domain entities.

## Getting started

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` — start the Vite dev server.
- `npm run build` — production build.
- `npm run lint` — run oxlint.
- `npm test` — run Green Wallet contract regression tests.
- `npm run preview` — preview the production build.

## Mirrored data contract

See `src/greenWallet.js` for synthetic projections of:

- `GreenRouteCredit`
- `RedemptionRequest`
- `ChargingHub`

The fixtures and helpers must mirror the canonical Relay Rider API contract.
They are not a second source of business truth and must not be used as a
separate persistence layer.
