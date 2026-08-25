# EV Credit Redemption Module

**Status:** Proposed prototype enhancement  
**Scope:** Participant redemption request flow and program-administrator review flow  
**Guardrail:** EV Charge Credit is a non-monetary program incentive. It is not currency, a fare, a payment instrument, or a certified emissions credit.

## Product intent

The module should make redemption understandable, auditable, and review-gated. A participant selects one issued EV Charge Credit and a Charging Hub, reviews the request summary, and submits a request. The credit then becomes unavailable for another request while it is under review. A program administrator can approve or deny the request; denials require an explanation. The prototype should make status and next steps visible without implying live charger availability or automatic payment settlement.

## Proposed participant experience

| Step | Experience | Guardrail |
|---|---|---|
| 1. Choose credit | Show only credits in `Issued` status, including amount, issue date, and source. | Do not call this a cash balance or payment balance. |
| 2. Choose hub | Show hub name, network, city, connector types, and operational status. | Candidate hubs are not represented as guaranteed available. |
| 3. Review request | Present a plain-language summary of the selected credit and hub before submission. | Explicitly state that approval is required. |
| 4. Submit | Create a redemption request and immediately show its status. | Disable duplicate submission through state transition. |
| 5. Track outcome | Show request status, selected hub, and administrator note when present. | Use `Fulfilled` only after approval; use `Denied` with a reason. |

## Prototype rules

The first version redeems an entire issued credit entry rather than allowing partial units. This keeps the ledger auditable and avoids inventing a unit-to-energy conversion before the founder approves the program definition. Only hubs with `Candidate`, `Verified`, or `Active` status may be displayed, while only `Verified` and `Active` hubs should be eligible for a production request. The current fixtures are synthetic and intentionally include candidate hubs, so the prototype continues to allow them while labeling them clearly.

A credit may transition from `Issued` to `Redemption requested`, then to `Fulfilled` or `Denied`. A denial must include a review note. A fulfilled or denied credit cannot be submitted again. The participant-facing copy must use **EV Charge Credit**, **Charging Hub**, **redemption request**, and **administrative review**; it must not use cash-back, transfer, payment, or currency language.

## Data model additions for a production backend

The current prototype stores redemption state on the credit record. A production implementation should preserve the credit as an immutable issuance ledger entry and create a separate `RedemptionRequest` record:

| Field | Purpose |
|---|---|
| `id` | Stable redemption-request identifier. |
| `creditId` | Link to the issued credit entry. |
| `participantId` | Authorization and participant history. |
| `chargingHubId` | Requested redemption location. |
| `requestedAt` | Audit timestamp. |
| `status` | Requested, under review, fulfilled, or denied. |
| `reviewedAt` | Decision timestamp. |
| `reviewedBy` | Administrator identity. |
| `reviewNote` | Required for denial; optional for approval. |
| `evidenceLabel` | Synthetic, modeled, or verified provenance label. |

The backend should enforce one active request per credit, authorize the participant and administrator roles separately, record every transition, and use an idempotency key on submission. Partner-network redemption should remain a separate integration decision until the unit definition, partnership agreements, and settlement mechanism are approved.

## Acceptance criteria for this prototype

The interface clearly distinguishes available credits from credits already requested, under review, fulfilled, or denied. Selecting a credit and hub produces a visible request summary, the submit control is disabled until both are selected, and submission moves the credit into the review queue without a page reload. An administrator can approve or deny a request, and the resulting state and note appear in the participant ledger. The app remains explicit that it is a research-beta prototype and not an activated payment system.

## Open decisions

The founder still needs to approve the earning rule, the unit-to-value definition, the production eligibility rule for Charging Hubs, whether partnerships require signed agreements before activation, and whether any network API will automatically apply a redeemed credit to a charging session.

**Evidence label:** Proposed / synthetic prototype. Not activated.
