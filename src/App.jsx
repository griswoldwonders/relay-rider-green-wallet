import { useMemo, useState } from "react";
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

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(`${date}T00:00:00`)
  );
}

export default function App() {
  const [credits, setCredits] = useState(seedGreenWalletCredits);
  const [draft, setDraft] = useState({ creditId: "", chargingHubId: "" });
  const [notice, setNotice] = useState("");

  const hubsById = Object.fromEntries(seedChargingHubs.map((hub) => [hub.id, hub]));
  const participantIds = [...new Set(credits.map((c) => c.participantId))];
  const pendingReview = credits.filter((c) => c.status === CREDIT_STATUSES.redemption_requested);
  const selectedCredit = credits.find((credit) => credit.id === draft.creditId);
  const selectedHub = seedChargingHubs.find((hub) => hub.id === draft.chargingHubId);
  const availableCredits = credits.filter((credit) => credit.status === CREDIT_STATUSES.issued);
  const requestHistory = useMemo(
    () => credits.filter((credit) => credit.status !== CREDIT_STATUSES.issued),
    [credits]
  );

  function submitRedemption() {
    if (!selectedCredit || !selectedHub) return;
    setCredits((current) => requestRedemption(current, selectedCredit.id, selectedHub.id));
    setNotice(`Request submitted for ${selectedCredit.amountUnits} ${selectedCredit.unitLabel}. An administrator must review it before fulfillment.`);
    setDraft({ creditId: "", chargingHubId: "" });
  }

  function decideRedemption(creditId, approve) {
    setCredits((current) => reviewRedemption(current, creditId, approve, approve ? "Approved by program admin." : "Denied by program admin."));
    setNotice(approve ? "Redemption approved and marked fulfilled." : "Redemption denied and returned with an administrator note.");
  }

  return (
    <div className="green-wallet-app">
      <header className="gw-header">
        <div>
          <span className="gw-eyebrow">Relay Rider · Program Incentive</span>
          <h1>Green Wallet · EV Charge Credit</h1>
          <p>
            Redeem an issued EV Charge Credit at a partner or institution-operated Charging Hub. Every redemption request
            requires administrative review before it is marked fulfilled.
          </p>
        </div>
        <span className="pill-badge">Prototype · For pilot review only</span>
      </header>

      {notice && (
        <div className="gw-notice" role="status">
          <strong>Request update</strong>
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss request update" onClick={() => setNotice("")}>Dismiss</button>
        </div>
      )}

      <section>
        <div className="gw-section-label">
          <h2>Participant EV Charge Credits</h2>
          <span>{participantIds.length} participants · {availableCredits.length} available entries</span>
        </div>
        <div className="gw-grid">
          {participantIds.map((participantId) => {
            const participantCredits = credits.filter((c) => c.participantId === participantId);
            const balance = walletBalance(credits, participantId);
            const displayName = participantCredits[0]?.participantName ?? participantId;
            return (
              <article className="gw-card" key={participantId}>
                <div className="gw-card-head">
                  <span>{displayName}</span>
                  <span className="gw-balance">{balance}<small>program units in review or available</small></span>
                </div>
                <ul>
                  {participantCredits.map((credit) => (
                    <li className="gw-credit-row" key={credit.id}>
                      <span>
                        <span className="gw-credit-amount">{credit.amountUnits} {credit.unitLabel}</span>
                        <span className="gw-credit-meta">Issued {formatDate(credit.issuedDate)} · {credit.issuedBy}</span>
                        {credit.chargingHubId && <span className="gw-credit-hub">Requested hub: {hubsById[credit.chargingHubId]?.name ?? credit.chargingHubId}</span>}
                        {credit.reviewNote && <span className="gw-credit-note">Admin note: {credit.reviewNote}</span>}
                      </span>
                      <Tag tone={statusTone(credit.status)}>{credit.status}</Tag>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className="gw-panel gw-redemption-panel">
        <div className="gw-section-label">
          <div>
            <h2>Redeem an EV Charge Credit</h2>
            <p>Select one issued credit and a Charging Hub, then review the request before submitting it.</p>
          </div>
          <span className="gw-step-badge">1 · Select and review</span>
        </div>
        <div className="gw-form-row">
          <label>
            Issued credit
            <select value={draft.creditId} onChange={(e) => setDraft((d) => ({ ...d, creditId: e.target.value }))}>
              <option value="">Select an issued credit</option>
              {availableCredits.map((credit) => (
                <option value={credit.id} key={credit.id}>{credit.participantName} · {credit.amountUnits} {credit.unitLabel}</option>
              ))}
            </select>
          </label>
          <label>
            Charging Hub
            <select value={draft.chargingHubId} onChange={(e) => setDraft((d) => ({ ...d, chargingHubId: e.target.value }))}>
              <option value="">Select a Charging Hub</option>
              {seedChargingHubs.map((hub) => (
                <option value={hub.id} key={hub.id}>{hub.name} · {hub.city} · {hub.status}</option>
              ))}
            </select>
          </label>
        </div>

        {selectedCredit && selectedHub ? (
          <div className="gw-request-summary">
            <div>
              <span className="gw-summary-label">Request summary</span>
              <strong>{selectedCredit.amountUnits} {selectedCredit.unitLabel} for {selectedCredit.participantName}</strong>
              <span>{selectedHub.name} · {selectedHub.network} · {selectedHub.connectorTypes.join(", ")}</span>
            </div>
            <div className="gw-summary-warning">Approval is required. This prototype does not reserve a charger or process a payment.</div>
          </div>
        ) : (
          <div className="gw-selection-hint">Your request summary will appear here after you select both an issued credit and a Charging Hub.</div>
        )}
        <button className="gw-primary-button" disabled={!selectedCredit || !selectedHub} onClick={submitRedemption}>
          Submit redemption request
        </button>
      </section>

      <section className="gw-panel">
        <div className="gw-section-label">
          <div>
            <h2>Administrative review queue</h2>
            <p>Approve or deny pending Charging Hub redemption requests.</p>
          </div>
          <span>{pendingReview.length} pending</span>
        </div>
        {pendingReview.length ? pendingReview.map((credit) => (
          <div className="gw-review-row" key={credit.id}>
            <div className="gw-review-main">
              <strong>{credit.participantName} · {credit.amountUnits} {credit.unitLabel}</strong>
              <small>{hubsById[credit.chargingHubId]?.name ?? credit.chargingHubId} · Requested for administrative review</small>
            </div>
            <div className="gw-review-actions">
              <button className="gw-secondary-button approve" onClick={() => decideRedemption(credit.id, true)}>Approve</button>
              <button className="gw-secondary-button deny" onClick={() => decideRedemption(credit.id, false)}>Deny</button>
            </div>
          </div>
        )) : <p className="gw-empty-state">No redemption requests awaiting review.</p>}
      </section>

      <section className="gw-panel">
        <div className="gw-section-label">
          <div>
            <h2>Redemption history</h2>
            <p>Every requested, fulfilled, or denied credit remains visible for pilot review.</p>
          </div>
          <span>{requestHistory.length} tracked</span>
        </div>
        <div className="gw-history-list">
          {requestHistory.map((credit) => (
            <div className="gw-history-row" key={credit.id}>
              <div><strong>{credit.participantName}</strong><span>{credit.amountUnits} {credit.unitLabel} · {credit.chargingHubId ? hubsById[credit.chargingHubId]?.name : "Hub not selected"}</span></div>
              <Tag tone={statusTone(credit.status)}>{credit.status}</Tag>
            </div>
          ))}
        </div>
      </section>

      <section className="gw-panel">
        <div className="gw-section-label"><div><h2>Charging Hubs</h2><p>Candidate partner and institution-operated locations. Availability is not guaranteed.</p></div><span>{seedChargingHubs.length} candidate locations</span></div>
        <div className="gw-hub-grid">
          {seedChargingHubs.map((hub) => (
            <div className="gw-hub-card" key={hub.id}>
              <span className="gw-hub-name">{hub.name}</span>
              <span className="gw-hub-meta">{hub.network} · {hub.city}</span>
              <div className="gw-hub-foot"><span className="gw-hub-connectors">{hub.stalls} stalls · {hub.connectorTypes.join(", ")}</span><Tag tone="neutral">{hub.status} · {hub.evidenceLabel}</Tag></div>
            </div>
          ))}
        </div>
      </section>

      <footer className="gw-footer">EV Charge Credit is a non-monetary program incentive. This research-beta prototype is not an activated payment system.</footer>
    </div>
  );
}
