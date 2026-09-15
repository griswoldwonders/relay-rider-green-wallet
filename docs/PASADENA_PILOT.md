# Manual Pasadena Charging-Benefit Pilot

Status: research-stage, manually administered. Not activated for production operations.

This repository now hosts the participant/administrator reference application **and**
the authoritative Node/SQLite backend for the Manual Pasadena Charging-Benefit Pilot
contract. Canonical money values are integer cents. Canonical credits are integers.
`100` credits authorize up to `$1` of sponsor-funded charging benefit. The funded
pilot budget is `$500` (`50,000` cents / `50,000` credits).

## Source of truth

| Concern | Authority |
| --- | --- |
| Credits, awards, redemptions, budget | SQLite ledgers via `server/pilotService.js` |
| Status transitions | `shared/contract.js` (`REDEMPTION_TRANSITIONS`) |
| Users / sessions / RBAC | `users`, `sessions` tables |
| Charging hubs / checklist | `charging_hubs`, `hub_checklist_items` |
| Evidence | `commute_evidence`, `charging_evidence`, `evidence_files` |
| Frontend | Display only; never computes authoritative balances |

The pilot remains disabled until an administrator activates it. Seeded locations are
`location_verified` and `pending` until the Active Hub Checklist is completed.

Green Wallet works with Relay Rider beta (commutes / AQMD feed) and the AQMD
module (Rule 2202 analysis). See `docs/COMPANION_INTEGRATION.md`. Those systems
do not mint charging-benefit credits.

## Local verification

```bash
npm ci
npm test
npm run build
npm run migrate
npm run dev
```

API: `http://127.0.0.1:8787`  
Vite UI: `http://127.0.0.1:5173` (proxies `/api`)

Demo password: `pilot-research-beta`

- Participant: `rider.a@example.test`
- Second participant: `rider.b@example.test`
- Administrator: `admin@commonpathways.example`

## Manual operating procedure

1. Sign in as administrator and activate the 90-day pilot (configurable effective date).
2. Complete every Active Hub Checklist item for a location, then activate the hub.
3. Confirm the participant is enrolled and has an eligible registered BEV.
4. Participant submits commute evidence for the local calendar day (`America/Los_Angeles`).
5. Participant submits charging evidence from an **active** hub (≥ 5.0 kWh, start outside 4:00–9:00 p.m. local).
6. Administrator accepts both evidence records. The backend awards exactly 100 credits when all rules pass (idempotent).
7. Participant requests a `$5` (500 credits) or `$10` (1,000 credits) redemption.
8. Administrator: `requested → under_review → approved` (sponsor funds reserved).
9. Voucher path: record provider/identifier/face value/dates → `benefit_issued` → participant confirms receipt or administrator settles.
10. Receipt path: `session_verification_pending` → record approved amount and delivery reference → `benefit_issued` → `settled`.
11. Generate the monthly reconciliation report / CSV.

## Deployment

Do not deploy until tests pass and a founder explicitly approves deployment.

```bash
npm ci
npm test
npm run build
PORT=8787 node server/index.js
```

Bind `0.0.0.0:$PORT`. SQLite and evidence files live on the local disk (`PILOT_DB_PATH`, `PILOT_UPLOAD_DIR`) and are ephemeral on hosts without a persistent volume.

## Guardrails

- No Stripe or other payment processor.
- No Tesla, ChargePoint, EVgo, Pasadena Water and Power, or live network integration.
- No implication that any of those operators, ArtCenter, or the City of Pasadena has agreed to participate.
- Credits are promotional accounting units, not cash, wages, or transferable property.
