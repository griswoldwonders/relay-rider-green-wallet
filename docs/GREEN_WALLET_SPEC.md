# Green Wallet Feature Spec

Status: Prototype / research-beta. Evidence label: Proposed. Not activated.

## Summary

Green Wallet is a participant-facing feature where an EV/hybrid participant
who completes qualifying planned routes receives an EV Charge Credit from
the sponsoring institution's program budget. Participants view their
balance and redeem credit at a partner or institution-operated Charging
Hub. Every redemption passes through administrative review before it is
marked fulfilled, consistent with Relay Rider's existing review-gated
model.

This is a standalone repository for the Green Wallet feature, separate
from CEO-Dashboard (executive tasks/agendas) and common-pathways-relay-rider
(the private product/engineering playbook of library, skills, and
reference docs). Green Wallet is a participant-facing feature app in its
own right and is versioned independently.

## What this is not

- Not currency. Not a fare, wallet balance transfer, or payment instrument.
- Not a guarantee of charger availability, live payment processing, or
  automatic fund transfer.
- Not a certified emissions reduction or carbon credit.

Use "EV Charge Credit," "Charging Hub," "redemption request," and
"administrative review" in all product copy. Do not use "cash back,"
"balance," "wallet transfer," or "payment" in participant-facing text.

## Actors

- **Participant**: an EV/hybrid planned-route participant who has earned
  credit through the program's `[NEEDS FOUNDER INPUT]`-defined earning
  rule (e.g. completed planned routes, verified corridor participation).
- **Program administrator**: reviews and approves/denies redemption
  requests, same role as existing administrative-review flows in Relay
  Rider.
- **Charging Hub**: a partner network location (ChargePoint, EVgo,
  Electrify America) or an institution-operated charging location.

## Data model (conceptual, backend-neutral)

### GreenWalletCredit

`id`, `participantId`, `amountUnits`, `unitLabel` (program-defined, e.g.
"kWh credit" — not a dollar unit), `issuedBy`, `issuedDate`, `status`
(`Issued` | `Redemption requested` | `Under administrative review` |
`Fulfilled` | `Denied`), `chargingHubId`, `reviewNote`, `evidenceLabel`.

### ChargingHub

`id`, `name`, `network`, `city`, `stalls`, `connectorTypes`,
`evidenceLabel`, `status` (`Candidate` | `Verified` | `Active`).

## Flow

1. Participant earns credit (`[NEEDS FOUNDER INPUT]`: exact earning rule
   and unit-to-value definition require founder approval before pilot).
2. Participant views balance and available Charging Hubs.
3. Participant submits a redemption request naming a Charging Hub.
4. Credit status moves to `Redemption requested` → `Under administrative
   review`.
5. Program administrator approves or denies. Approval marks the credit
   `Fulfilled`; denial requires a review note.

## Open founder decisions

- Exact earning rule (which planned-route milestones trigger a credit)
  — `[NEEDS FOUNDER INPUT]`
- Unit definition and any real-world redemption mechanism at a partner
  charging network (e.g. whether a partner API auto-applies credit to a
  charging session) — `[NEEDS FOUNDER INPUT]`
- Whether Charging Hub partnerships require signed agreements before any
  hub is marked `Active` — `[NEEDS FOUNDER INPUT]`

## Repository layout

- `src/greenWallet.js` — data model, seed fixtures, redemption logic.
- `src/App.jsx` — participant-facing wallet + admin review UI (prototype).
- `docs/GREEN_WALLET_SPEC.md` — this document.

## Related repositories

- `griswoldwonders/CEO-Dashboard` (now `ceo-workbench-v3`) — executive
  tasks/agenda dashboard. Green Wallet is not part of that app.
- `griswoldwonders/common-pathways-relay-rider` — private product and
  engineering playbook (library, skills, reference docs). Green Wallet
  implementation code does not live there; only cross-references may be
  added if useful.
