import { useMemo, useState } from 'react';
import {
  CREDIT_STATUSES,
  REDEMPTION_STATUSES,
  seedChargingHubs,
  seedGreenWalletCredits,
  seedRedemptionRequests,
  walletBalance,
  requestRedemption,
  startRedemptionReview,
  reviewRedemption,
} from './greenWallet.js';
import './App.css';

function statusTone(status) {
  if (status === REDEMPTION_STATUSES.fulfilled || status === CREDIT_STATUSES.redeemed) return 'success';
  if (status === REDEMPTION_STATUSES.denied) return 'danger';
  if (status === REDEMPTION_STATUSES.requested || status === REDEMPTION_STATUSES.under_review) return 'accent';
  return 'neutral';
}
function Tag({ children, tone = 'neutral' }) { return <span className={`tag tag-${tone}`}>{children}</span>; }
function formatDate(value) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }

export default function App() {
  const [credits] = useState(seedGreenWalletCredits);
  const [requests, setRequests] = useState(seedRedemptionRequests);
  const [draft, setDraft] = useState({ creditId: '', chargingHubId: '' });
  const [notice, setNotice] = useState('');
  const hubsById = Object.fromEntries(seedChargingHubs.map((hub) => [hub.id, hub]));
  const creditsById = Object.fromEntries(credits.map((credit) => [credit.id, credit]));
  const participantIds = [...new Set(credits.map((c) => c.participantId))];
  const pendingReview = requests.filter((r) => r.status === REDEMPTION_STATUSES.requested || r.status === REDEMPTION_STATUSES.under_review);
  const selectedCredit = credits.find((credit) => credit.id === draft.creditId);
  const selectedHub = seedChargingHubs.find((hub) => hub.id === draft.chargingHubId);
  const requestedCreditIds = new Set(requests.filter((r) => ![REDEMPTION_STATUSES.denied].includes(r.status)).map((r) => r.creditId));
  const availableCredits = credits.filter((credit) => credit.status === CREDIT_STATUSES.issued && !requestedCreditIds.has(credit.id));
  const requestHistory = useMemo(() => requests.filter((r) => [REDEMPTION_STATUSES.fulfilled, REDEMPTION_STATUSES.denied].includes(r.status)), [requests]);

  function submitRedemption() {
    if (!selectedCredit || !selectedHub) return;
    setRequests((current) => requestRedemption(current, { creditId: selectedCredit.id, participantId: selectedCredit.participantId, chargingHubId: selectedHub.id, requestedUnits: selectedCredit.amountUnits, unitLabel: selectedCredit.unitLabel }));
    setNotice(`Request submitted for ${selectedCredit.amountUnits} ${selectedCredit.unitLabel}. Administrative review is required.`);
    setDraft({ creditId: '', chargingHubId: '' });
  }
  function beginReview(id) { setRequests((current) => startRedemptionReview(current, id)); setNotice('Request moved to administrative review.'); }
  function decideRedemption(id, decision) { setRequests((current) => reviewRedemption(current, id, decision, decision === REDEMPTION_STATUSES.fulfilled ? 'Synthetic research-beta fulfillment.' : 'Synthetic research-beta denial.')); setNotice(decision === REDEMPTION_STATUSES.fulfilled ? 'Redemption marked fulfilled.' : 'Redemption denied.'); }

  return <div className="green-wallet-app">
    <header className="gw-header"><div><span className="gw-eyebrow">Relay Rider · Program Incentive</span><h1>Green Wallet · EV Charge Credit</h1><p>Participant-facing reference client for institution-sponsored Green Route Credits. Redemption requests remain separate from credit issuance and require administrative review.</p></div><span className="pill-badge">Prototype · Synthetic fixtures</span></header>
    {notice && <div className="gw-notice" role="status"><strong>Request update</strong><span>{notice}</span><button type="button" onClick={() => setNotice('')}>Dismiss</button></div>}

    <section><div className="gw-section-label"><h2>Participant Green Route Credits</h2><span>{participantIds.length} participants · {availableCredits.length} available entries</span></div><div className="gw-grid">
      {participantIds.map((participantId) => { const participantCredits = credits.filter((c) => c.participantId === participantId); const balance = walletBalance(credits, participantId); return <article className="gw-card" key={participantId}><div className="gw-card-head"><span>{participantCredits[0]?.participantName ?? participantId}</span><span className="gw-balance">{balance}<small>available program units</small></span></div><ul>{participantCredits.map((credit) => <li className="gw-credit-row" key={credit.id}><span><span className="gw-credit-amount">{credit.amountUnits} {credit.unitLabel}</span><span className="gw-credit-meta">Issued {formatDate(credit.issuedAt)} · {credit.activity}</span></span><Tag tone={statusTone(credit.status)}>{credit.status}</Tag></li>)}</ul></article>; })}
    </div></section>

    <section className="gw-panel gw-redemption-panel"><div className="gw-section-label"><div><h2>Request redemption</h2><p>Select an issued credit and candidate Charging Hub. This does not reserve a charger or process a payment.</p></div><span className="gw-step-badge">1 · Request</span></div><div className="gw-form-row"><label>Issued credit<select value={draft.creditId} onChange={(e) => setDraft((d) => ({ ...d, creditId: e.target.value }))}><option value="">Select an issued credit</option>{availableCredits.map((credit) => <option value={credit.id} key={credit.id}>{credit.participantName} · {credit.amountUnits} {credit.unitLabel}</option>)}</select></label><label>Charging Hub<select value={draft.chargingHubId} onChange={(e) => setDraft((d) => ({ ...d, chargingHubId: e.target.value }))}><option value="">Select a Charging Hub</option>{seedChargingHubs.map((hub) => <option value={hub.id} key={hub.id}>{hub.name} · {hub.city} · {hub.status}</option>)}</select></label></div><button className="gw-primary-button" disabled={!selectedCredit || !selectedHub} onClick={submitRedemption}>Submit redemption request</button></section>

    <section className="gw-panel"><div className="gw-section-label"><div><h2>Administrative review queue</h2><p>Canonical lifecycle: requested → under-review → fulfilled or denied.</p></div><span>{pendingReview.length} pending</span></div>{pendingReview.length ? pendingReview.map((request) => { const credit = creditsById[request.creditId]; return <div className="gw-review-row" key={request.id}><div className="gw-review-main"><strong>{credit?.participantName ?? request.participantId} · {request.requestedUnits} {request.unitLabel}</strong><small>{hubsById[request.chargingHubId]?.name ?? request.chargingHubId} · {request.status}</small></div><div className="gw-review-actions">{request.status === REDEMPTION_STATUSES.requested ? <button className="gw-secondary-button" onClick={() => beginReview(request.id)}>Begin review</button> : <><button className="gw-secondary-button approve" onClick={() => decideRedemption(request.id, REDEMPTION_STATUSES.fulfilled)}>Fulfill</button><button className="gw-secondary-button deny" onClick={() => decideRedemption(request.id, REDEMPTION_STATUSES.denied)}>Deny</button></>}</div></div>; }) : <p className="gw-empty-state">No redemption requests awaiting review.</p>}</section>

    <section className="gw-panel"><div className="gw-section-label"><div><h2>Redemption history</h2><p>Terminal request outcomes remain separate from credit records.</p></div><span>{requestHistory.length} tracked</span></div><div className="gw-history-list">{requestHistory.map((request) => { const credit = creditsById[request.creditId]; return <div className="gw-history-row" key={request.id}><div><strong>{credit?.participantName ?? request.participantId}</strong><span>{request.requestedUnits} {request.unitLabel} · {hubsById[request.chargingHubId]?.name ?? request.chargingHubId}</span></div><Tag tone={statusTone(request.status)}>{request.status}</Tag></div>; })}</div></section>

    <section className="gw-panel"><div className="gw-section-label"><div><h2>Charging Hubs</h2><p>Candidate reference locations. Availability is not guaranteed.</p></div><span>{seedChargingHubs.length} locations</span></div><div className="gw-hub-grid">{seedChargingHubs.map((hub) => <div className="gw-hub-card" key={hub.id}><span className="gw-hub-name">{hub.name}</span><span className="gw-hub-meta">{hub.network} · {hub.city}</span><div className="gw-hub-foot"><span className="gw-hub-connectors">{hub.stalls} stalls · {hub.connectorTypes.join(', ')}</span><Tag>{hub.status} · {hub.evidenceLabel}</Tag></div></div>)}</div></section>
    <footer className="gw-footer">Green Route Credits are program-defined promotional participation benefits. This research-beta prototype is not an activated payment system.</footer>
  </div>;
}
