import { useState } from "react";
import {
  CREDIT_STATUSES,
  seedChargingHubs,
  seedGreenWalletCredits,
  walletBalance,
  requestRedemption,
  reviewRedemption
} from "./greenWallet.js";
import "./App.css";

function statusTone(status) {
  if (status === CREDIT_STATUSES.fulfilled) return "success";
  if (status === CREDIT_STATUSES.denied) return "danger";
  if (status === CREDIT_STATUSES.redemption_requested || status === CREDIT_STATUSES.under_review) return "accent";
  return "neutral";
}

function Tag({ children, tone = "neutral" }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export default function App() {
  const [credits, setCredits] = useState(seedGreenWalletCredits);
  const [draft, setDraft] = useState({ creditId: "", chargingHubId: "" });

  const hubsById = Object.fromEntries(seedChargingHubs.map((hub) => [hub.id, hub]));
  const participantIds = [...new Set(credits.map((c) => c.participantId))];
  const pendingReview = credits.filter((c) => c.status === CREDIT_STATUSES.redemption_requested);

  function submitRedemption() {
    if (!draft.creditId || !draft.chargingHubId) return;
    setCredits((current) => requestRedemption(current, draft.creditId, draft.chargingHubId));
    setDraft({ creditId: "", chargingHubId: "" });
  }

  function decideRedemption(creditId, approve) {
    setCredits((current) => reviewRedemption(current, creditId, approve, approve ? "" : "Denied by program admin."));
  }

  return (
    <div className="green-wallet-app">
      <header className="gw-header">
        <div>
          <h1>Green Wallet · EV Charge Credit</h1>
          <p>
            Participants earn EV Charge Credit from the sponsoring institution&rsquo;s program budget and redeem it
            at a partner or institution-operated Charging Hub. Every redemption request requires administrative
            review before it is marked fulfilled. This is a research-beta prototype, not an activated payment
            system.
          </p>
        </div>
        <Tag tone="warning">Prototype · For pilot review only</Tag>
      </header>

      <section className="gw-grid">
        {participantIds.map((participantId) => {
          const participantCredits = credits.filter((c) => c.participantId === participantId);
          const balance = walletBalance(credits, participantId);
          const displayName = participantCredits[0]?.participantName ?? participantId;
          return (
            <article className="gw-card" key={participantId}>
              <div className="gw-card-head">
                <span>{displayName}</span>
                <strong>{balance} kWh credit balance</strong>
              </div>
              <ul>
                {participantCredits.map((credit) => (
                  <li key={credit.id}>
                    {credit.amountUnits} {credit.unitLabel} · <Tag tone={statusTone(credit.status)}>{credit.status}</Tag>
                    {credit.chargingHubId && ` · ${hubsById[credit.chargingHubId]?.name ?? credit.chargingHubId}`}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <section className="gw-panel">
        <h2>Request redemption</h2>
        <p>Choose an issued credit and a Charging Hub. The request moves to administrative review.</p>
        <div className="gw-form-row">
          <label>
            Credit
            <select value={draft.creditId} onChange={(e) => setDraft((d) => ({ ...d, creditId: e.target.value }))}>
              <option value="">Select an issued credit</option>
              {credits
                .filter((c) => c.status === CREDIT_STATUSES.issued)
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.participantName} · {c.amountUnits} {c.unitLabel}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Charging Hub
            <select
              value={draft.chargingHubId}
              onChange={(e) => setDraft((d) => ({ ...d, chargingHubId: e.target.value }))}
            >
              <option value="">Select a Charging Hub</option>
              {seedChargingHubs.map((hub) => (
                <option value={hub.id} key={hub.id}>
                  {hub.name} ({hub.network})
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="gw-primary-button" disabled={!draft.creditId || !draft.chargingHubId} onClick={submitRedemption}>
          Submit redemption request
        </button>
      </section>

      <section className="gw-panel">
        <h2>Administrative review queue</h2>
        <p>Approve or deny pending Charging Hub redemption requests.</p>
        {pendingReview.length ? (
          pendingReview.map((credit) => (
            <div className="gw-review-row" key={credit.id}>
              <span>
                <strong>
                  {credit.participantName} · {credit.amountUnits} {credit.unitLabel}
                </strong>
                <small>Requested hub: {hubsById[credit.chargingHubId]?.name ?? credit.chargingHubId}</small>
              </span>
              <div>
                <button className="gw-secondary-button" onClick={() => decideRedemption(credit.id, true)}>
                  Approve
                </button>
                <button className="gw-secondary-button" onClick={() => decideRedemption(credit.id, false)}>
                  Deny
                </button>
              </div>
            </div>
          ))
        ) : (
          <p>No redemption requests awaiting review.</p>
        )}
      </section>

      <section className="gw-panel">
        <h2>Charging Hubs</h2>
        <p>Candidate partner and institution-operated locations.</p>
        <ul>
          {seedChargingHubs.map((hub) => (
            <li key={hub.id}>
              {hub.name} · {hub.network} · {hub.stalls} stalls · <Tag tone="neutral">{hub.status}</Tag>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
