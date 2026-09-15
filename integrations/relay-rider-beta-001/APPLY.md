# Apply Green Wallet into relay-rider-beta-001

The commuter Green Wallet belongs in
[relay-rider-beta-001](https://github.com/griswoldwonders/relay-rider-beta-001).
This folder is the patch that makes `?screen=wallet` (Home / Profile → Open Green
Wallet) render the Green Route Credits prototype inside that app.

This cloud agent could not push
`cursor/embed-green-route-credits-10d8` to beta-001 (GitHub 403 for `cursor[bot]`).
Copy these files into a beta-001 clone, then open a PR there.

```bash
BETA=../relay-rider-beta-001   # adjust to your clone
cp src/greenRoute/* "$BETA/src/greenRoute/"
cp src/screens/GreenWalletHost.tsx "$BETA/src/screens/"
cp src/screens/GreenWalletHost.acceptance.test.tsx "$BETA/src/screens/"
cp src/App.tsx "$BETA/src/App.tsx"
cp docs/GREEN_WALLET_INTEGRATION.md "$BETA/docs/GREEN_WALLET_INTEGRATION.md"
# Merge README.md incentives section from docs notes, or copy the Incentives
# section from the committed beta worktree if you have it.
```

`src/App.tsx` here is the **full** beta `App.tsx` after the host wiring, not a
partial diff. Replace the beta file with it, or merge if main has moved.

Behavior after apply:

- `wallet` screen → `GreenWalletHost` (Maya Chen / Pasadena–Glendale demo)
- **Open hub redemption wallet** → existing `WalletScreen` (acceptance tests unchanged)
- **Open hub review queue** → existing `WalletAdminScreen`
