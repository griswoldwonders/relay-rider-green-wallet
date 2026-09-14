# Relay Rider · Green Wallet

Standalone **Manual Pasadena Charging-Benefit Pilot** application. The React UI is
the participant and administrator console. The Node/SQLite backend is the
authoritative ledger for credits, redemptions, evidence, hub activation, and the
$500 Common Pathways Technologies sponsor budget.

See `docs/PASADENA_PILOT.md` for operating instructions, `docs/COMPANION_INTEGRATION.md`
for how this ledger works with Relay Rider beta and the AQMD module, and
`docs/GREEN_WALLET_SPEC.md` for older terminology that the Pasadena contract supersedes.

Status: research-stage / pre-activation. Seed data is synthetic. Locations are
independently listed as verified addresses and are **not** active until an
administrator completes the Active Hub Checklist.

## Guardrails

- Green Route Credits are promotional accounting units (`100` credits = `$1` of
  eligible charging benefit). They are not cash, wages, cryptocurrency, stored
  value, utility credits, or transferable property.
- Only `$5` (500 credits) and `$10` (1,000 credits) redemptions are allowed.
- Benefits cannot be obligated beyond the `$500` funded budget.
- Redemption uses the canonical status machine in `shared/contract.js`.
- This application does not pay a charger, start a session, or integrate a live network.

## Scripts

```bash
npm ci
npm test
npm run build
npm run dev
```

- `npm run dev` — API on `:8787` plus Vite on `:5173`
- `npm start` — serve API and production `dist/` (run `npm run build` first)
- `npm run migrate` / `npm run migrate:down` — apply or roll back SQLite migrations
- `npm test` — contract, ledger, and HTTP isolation tests
- `npm run lint` — oxlint
- `npm run build` — production frontend

Demo password: `pilot-research-beta` (see `.env.example`).
