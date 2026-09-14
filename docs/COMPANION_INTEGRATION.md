# Companion integration: Relay Rider beta + AQMD module + Green Wallet

Green Wallet does **not** replace
[relay-rider-beta-001](https://github.com/griswoldwonders/relay-rider-beta-001) or
[aqmd-module-tool](https://github.com/griswoldwonders/aqmd-module-tool).
The three systems work together with a hard ownership split.

| System | Owns | Does not own |
| --- | --- | --- |
| Relay Rider beta | Institution/membership, validated `CommuterRecord`s, `GET /api/institutions/{id}/aqmd-feed/` (`rr-aqmd-feed-v1`) | Pasadena $500 credit ledger, kWh awards |
| AQMD module tool | Rule 2202 / TDM analysis of that feed (`writes_to_beta: false`) | Credit minting, charging sessions, redemptions |
| Green Wallet | Qualifying-day awards, credit ledger, sponsor budget, charging evidence, hub checklist, $5/$10 redemptions | Rule 2202 certification, beta commute SoR |

## Data flow

```
Relay Rider beta (commute SoR)
        │  rr-aqmd-feed-v1  (Token auth, read-only)
        ▼
AQMD module tool (Rule 2202 / AVR / VMT)     ── no credits ──
        │
        │  optional push  rr-gw-commute-evidence-v1
        ▼
Green Wallet  ← also admin pull of the same feed
        │  charging evidence + 5.0 kWh + off-peak + hub active
        ▼
100 Green Route Credits (this ledger only)
        │  optional gw-award-created-v1 webhook
        ▼
Relay Rider beta (KPI / display, never a second balance)
```

A feed commute becomes **pending** Green Wallet commute evidence. An administrator
still accepts it. Credits are issued only with accepted charging evidence under
the Pasadena earning rule.

## Configure Green Wallet

```
RELAY_RIDER_API_BASE=http://127.0.0.1:8877/api
RELAY_RIDER_API_TOKEN=  # Django rest token; never VITE_*
RELAY_RIDER_INSTITUTION_ID=12
RELAY_RIDER_AWARD_WEBHOOK_URL=  # optional POST gw-award-created-v1
COMPANION_INGEST_TOKEN=  # machine push to /api/integrations/commute-days
```

Map beta `external_id` values to Green Wallet users in `companion_identities`
(demo: `rr-participant-a` → `rider.a@example.test`).

## Endpoints

- `GET /api/admin/companions` — ownership matrix and sync status
- `POST /api/admin/companions/relay-rider/ingest-feed` — pull configured feed, or `{ "feed": { ... } }` for a pasted `rr-aqmd-feed-v1` document
- `POST /api/integrations/commute-days` — machine ingest (`X-Companion-Token`)

## AQMD module

Keep using `fetchRelayRiderAqmdFeed` in `aqmd-module-tool/src/relayRiderFeed.ts`.
Do not award credits from Rule 2202 exports. To share a qualifying commute day
with this pilot, POST `rr-gw-commute-evidence-v1` to `/api/integrations/commute-days`.
