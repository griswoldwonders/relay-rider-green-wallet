# Green Wallet Reference Client Spec

Status: Prototype / research beta. Evidence label: Synthetic / proposed. Not activated.

## Summary

Green Wallet is a participant-facing Relay Rider experience for viewing
program-defined Green Route Credits and submitting redemption requests against
program-configured Charging Hubs. Every redemption request requires
administrative review before it can be marked fulfilled.

The canonical Green Wallet domain is owned by the Django backend in
`griswoldwonders/relay-rider-beta-001`. This standalone repository is a UX
reference client and contract-fixture environment only. It must not become a
second persistence layer or define independent business semantics.

## What this is not

- Not currency, a fare, wages, guaranteed compensation, or a payment instrument.
- Not a direct charging reimbursement or automatic charger payment mechanism.
- Not a guarantee of charger availability, charging access, or transportation.
- Not a certified emissions reduction, carbon credit, LCFS credit, or utility credit.
- Not a live charging-network or Charging Intelligence implementation.

## Canonical terminology

Use:

- **Green Route Credit** — program-defined promotional or institution-sponsored
  participation benefit.
- **Charging Hub** — participant-facing program-configured charging location.
- **Redemption request** — participant request against an issued credit.
- **Administrative review** — required review step before fulfillment.

Machine values must remain lowercase and match the Relay Rider backend.
Display labels may use title case.

## Actors

- **Participant** — an enrolled research-beta participant viewing issued Green
  Route Credits and submitting a redemption request.
- **Program administrator** — authorized institutional staff who review requests.
- **Charging Hub** — a candidate, verified, or active program-configured reference
  location. Its presence does not imply live availability or a formal network
  integration.

## Mirrored data contract

### GreenRouteCredit

Credit issuance is independent of redemption-request state.

Fields mirrored by the standalone fixtures:

`id`, `participantId`, `participantName`, `activity`, `amountUnits`,
`unitLabel`, `status`, `issuedAt`, `evidenceLabel`.

Canonical credit statuses:

- `issued`
- `redeemed`
- `expired`

`amountUnits` is a program-defined non-monetary quantity. It must never be
inferred from estimated miles reduced, estimated CO2, or another impact metric.

### RedemptionRequest

Fields mirrored by the standalone fixtures:

`id`, `creditId`, `participantId`, `chargingHubId`, `requestedUnits`,
`unitLabel`, `status`, `requestedAt`, `reviewedAt`, `reviewedBy`, `reviewNote`.

Canonical request lifecycle:

`requested → under-review → fulfilled|denied`

`fulfilled` and `denied` are terminal in the current research-beta contract.
A denied request does not consume the standalone client's display availability;
non-denied requests reserve the referenced credit from additional requests in
the reference UI.

### ChargingHub

Fields:

`id`, `name`, `network`, `city`, `stalls`, `connectorTypes`, `evidenceLabel`,
`status`.

Canonical status values:

- `candidate`
- `verified`
- `active`

Canonical evidence labels:

- `synthetic`
- `modeled`
- `verified`

These values describe the program record, not real-time charger availability.

## Reference-client flow

1. Load synthetic credit, redemption-request, and Charging Hub projections.
2. Display only credit units still available for a new request.
3. Participant selects one issued credit and one program-configured Charging Hub.
4. Create a separate redemption request with status `requested`.
5. Administrator moves the request to `under-review`.
6. Administrator marks it `fulfilled` or `denied`.
7. The reference UI retains terminal request history for review.

The fixture helpers emulate UI commands only. Server-side tenant isolation,
transition validation, reviewer metadata, and credit-unit controls remain the
responsibility of the canonical Relay Rider backend.

## Explicitly out of scope

Do not add any of the following to this repository as part of the Green Wallet
contract mirror:

- independent database or persistence layer
- Institution/Membership authority
- Site or IncentiveProgram
- ChargingStation or EVSE
- ChargingSession
- CreditEligibilityEvent
- ProgramBudgetLedger
- DecisionCard
- payment processing
- RFID issuance
- charger control
- OCPP/OCPI/Plug & Charge integration
- live charging-network APIs

## Open founder decisions

- Exact earning rule for Green Route Credits — `[NEEDS FOUNDER INPUT]`.
- Program-specific definition/value of one credit unit — `[NEEDS FOUNDER INPUT]`.
- Real-world fulfillment mechanism for an approved/fulfilled benefit —
  `[NEEDS FOUNDER INPUT]`.
- Requirements for marking a Charging Hub `active` — `[NEEDS FOUNDER INPUT]`.

## Repository layout

- `src/greenWallet.js` — synthetic canonical-contract fixtures and UI helpers.
- `src/greenWallet.test.js` — contract regression tests.
- `src/App.jsx` — standalone reference UI.
- `.github/workflows/ci.yml` — lint/test/build verification.
- `docs/GREEN_WALLET_SPEC.md` — this document.
