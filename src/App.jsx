import { useEffect, useState } from 'react';
import { api } from './api.js';
import './App.css';

function Tag({ children, tone = 'neutral' }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

function cents(value) {
  return `$${(Number(value) / 100).toFixed(2)}`;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('rider.a@example.test');
  const [password, setPassword] = useState('pilot-research-beta');

  useEffect(() => {
    api.session().then(setSession).catch(() => setSession(null));
  }, []);

  async function login(event) {
    event.preventDefault();
    try {
      setSession(await api.login(email, password));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function logout() {
    await api.logout();
    setSession(null);
  }

  return (
    <div className="green-wallet-app">
      <header className="gw-header">
        <div>
          <span className="gw-eyebrow">Relay Rider · Manual Pasadena Charging-Benefit Pilot</span>
          <h1>Green Wallet</h1>
          <p>Research-stage promotional credits administered by Common Pathways Technologies. 100 credits = $1 in eligible charging benefits. This is not cash, wages, or a charger-payment system.</p>
        </div>
        <span className="pill-badge">Manual pilot · $500 sponsor budget</span>
      </header>
      {error && <div className="gw-notice" role="alert"><strong>Notice</strong><span>{error}</span><button type="button" onClick={() => setError('')}>Dismiss</button></div>}
      {!session?.user ? (
        <form className="gw-panel" onSubmit={login}>
          <h2>Sign in</h2>
          <p>Demo participants: rider.a@example.test / rider.b@example.test. Administrator: admin@commonpathways.example. Password: pilot-research-beta.</p>
          <div className="gw-form-row">
            <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          </div>
          <button className="gw-primary-button" type="submit">Sign in</button>
        </form>
      ) : session.user.role === 'administrator' ? (
        <AdminView onLogout={logout} onError={setError} user={session.user} />
      ) : (
        <ParticipantView onLogout={logout} onError={setError} user={session.user} />
      )}
    </div>
  );
}

function ParticipantView({ user, onLogout, onError }) {
  const [data, setData] = useState(null);
  const [commute, setCommute] = useState({ commuteDate: '', originZone: '', destination: '', travelMode: 'battery_electric_vehicle' });
  const [charging, setCharging] = useState({ hubId: '', chargingDate: '', startAt: '', energyKwh: '5.0', evidenceSource: 'receipt', sessionIdentifier: '' });
  const [redeem, setRedeem] = useState({ credits: 500, deliveryMethod: 'voucher' });

  async function reload() {
    setData(await api.participant());
  }
  useEffect(() => { reload().catch((err) => onError(err.message)); }, []);

  if (!data) return <p className="gw-empty-state">Loading participant wallet…</p>;

  return (
    <>
      <div className="gw-toolbar"><strong>{user.displayName}</strong><button className="gw-secondary-button" type="button" onClick={onLogout}>Sign out</button></div>
      <section className="gw-grid">
        <article className="gw-card">
          <div className="gw-card-head"><span>Available promotional credits</span><span className="gw-balance">{data.availableCredits}<small>Green Route Credits</small></span></div>
          <p>{data.conversion}</p>
          <p>Progress to next option: {data.progress.remaining} credits to {data.progress.nextCredits ?? 'both options unlocked'}.</p>
          <p>Monthly limit: {data.monthlyLimit.awardsUsed}/{data.monthlyLimit.awardsMax} awards · {data.monthlyLimit.creditsUsed}/{data.monthlyLimit.creditsMax} credits ({data.monthlyLimit.timezone}).</p>
        </article>
      </section>
      <p className="gw-footer">{data.promotionalNotice}</p>

      <section className="gw-panel">
        <h2>Commute evidence</h2>
        <p>Minimum necessary fields for a Qualifying Clean Commute and Charging Day. Do not include extra personal data.</p>
        <div className="gw-form-row">
          <label>Commute date<input type="date" value={commute.commuteDate} onChange={(e) => setCommute({ ...commute, commuteDate: e.target.value })} /></label>
          <label>Origin zone<input value={commute.originZone} onChange={(e) => setCommute({ ...commute, originZone: e.target.value })} /></label>
          <label>Destination / participating site<input value={commute.destination} onChange={(e) => setCommute({ ...commute, destination: e.target.value })} /></label>
        </div>
        <button className="gw-primary-button" type="button" onClick={() => api.commute({ ...commute, attestation: true }).then(reload).catch((err) => onError(err.message))}>Attest and submit commute</button>
        <ul className="gw-history-list">{data.commuteEvidence.map((row) => <li key={row.id} className="gw-history-row"><div><strong>{row.commute_date}</strong><span>{row.origin_zone} → {row.destination}</span></div><Tag>{row.decision}</Tag></li>)}</ul>
      </section>

      <section className="gw-panel">
        <h2>Charging evidence</h2>
        <p>Submit a session from an administrator-activated hub. Peak starts (4:00–9:00 p.m. America/Los_Angeles) are not eligible.</p>
        <div className="gw-form-row">
          <label>Hub<select value={charging.hubId} onChange={(e) => setCharging({ ...charging, hubId: e.target.value })}><option value="">Select hub</option>{data.hubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name} · {hub.activationStatus}</option>)}</select></label>
          <label>Charging date<input type="date" value={charging.chargingDate} onChange={(e) => setCharging({ ...charging, chargingDate: e.target.value })} /></label>
          <label>Start time (UTC ISO)<input value={charging.startAt} onChange={(e) => setCharging({ ...charging, startAt: e.target.value })} placeholder="2026-06-02T16:00:00.000Z" /></label>
          <label>Energy kWh<input value={charging.energyKwh} onChange={(e) => setCharging({ ...charging, energyKwh: e.target.value })} /></label>
          <label>Session / receipt id<input value={charging.sessionIdentifier} onChange={(e) => setCharging({ ...charging, sessionIdentifier: e.target.value })} /></label>
        </div>
        <button className="gw-primary-button" type="button" onClick={() => api.charging(charging).then(reload).catch((err) => onError(err.message))}>Submit charging evidence</button>
        <ul className="gw-history-list">{data.chargingEvidence.map((row) => <li key={row.id} className="gw-history-row"><div><strong>{row.charging_date}</strong><span>{row.energy_wh} Wh · {row.session_identifier || 'no session id'}</span></div><Tag>{row.decision}</Tag></li>)}</ul>
      </section>

      <section className="gw-panel gw-redemption-panel">
        <h2>Request a charging benefit</h2>
        <p>$5 (500 credits) or $10 (1,000 credits) only. No partial conversion. An administrator must review every request.</p>
        <div className="gw-form-row">
          <label>Amount<select value={redeem.credits} onChange={(e) => setRedeem({ ...redeem, credits: Number(e.target.value) })}><option value={500}>500 credits · $5</option><option value={1000}>1,000 credits · $10</option></select></label>
          <label>Delivery<select value={redeem.deliveryMethod} onChange={(e) => setRedeem({ ...redeem, deliveryMethod: e.target.value })}><option value="voucher">Voucher delivery</option><option value="receipt">Receipt-based delivery</option></select></label>
        </div>
        <button className="gw-primary-button" type="button" disabled={data.availableCredits < redeem.credits} onClick={() => api.redeem(redeem).then(reload).catch((err) => onError(err.message))}>Submit redemption request</button>
      </section>

      <section className="gw-panel">
        <h2>Redemption timeline</h2>
        {data.redemptions.map((row) => (
          <div className="gw-review-row" key={row.id}>
            <div className="gw-review-main">
              <strong>{row.credits} credits · {cents(row.benefit_cents)} · {row.delivery_method}</strong>
              <small>{row.history.map((item) => item.to_status).join(' → ')}</small>
            </div>
            {row.status === 'benefit_issued' && <button className="gw-secondary-button" type="button" onClick={() => api.confirmReceipt(row.id).then(reload).catch((err) => onError(err.message))}>Confirm receipt</button>}
            <Tag tone={row.status === 'settled' ? 'success' : 'accent'}>{row.status}</Tag>
          </div>
        ))}
      </section>

      <section className="gw-panel">
        <h2>Pilot charging locations</h2>
        <p>Independently verified reference locations. No utility, city, campus, or network operator agreement is implied. A hub is eligible only after the Active Hub Checklist and administrator activation.</p>
        <div className="gw-hub-grid">{data.hubs.map((hub) => <div className="gw-hub-card" key={hub.id}><span className="gw-hub-name">{hub.name}</span><span className="gw-hub-meta">{hub.addressLine}, {hub.city}, {hub.state}</span><Tag>{hub.verificationStatus} · {hub.activationStatus}</Tag></div>)}</div>
      </section>
    </>
  );
}

function AdminView({ user, onLogout, onError }) {
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [report, setReport] = useState(null);
  const [delivery, setDelivery] = useState({ voucherProvider: 'manual-sponsor-desk', voucherIdentifier: '', faceValueCents: 500, issueDate: '', expirationDate: '', approvedAmountCents: 500, deliveryReference: '' });

  async function reload() {
    setData(await api.admin());
  }
  useEffect(() => { reload().catch((err) => onError(err.message)); }, []);
  if (!data) return <p className="gw-empty-state">Loading administrator console…</p>;

  return (
    <>
      <div className="gw-toolbar"><strong>{user.displayName}</strong><button className="gw-secondary-button" type="button" onClick={onLogout}>Sign out</button></div>
      <section className="gw-panel">
        <h2>Sponsor budget</h2>
        <p>{data.pilot.sponsor_name} · funded {cents(data.budget.funded)} · available {cents(data.budget.available)} · reserved {cents(data.budget.reserved)} · issued {cents(data.budget.issued)} · settled {cents(data.budget.settled)}</p>
        <p>Pilot {data.pilot.enabled ? 'active' : 'disabled'} · timezone {data.pilot.timezone} · duration {data.pilot.duration_days} days.</p>
        {!data.pilot.enabled && <button className="gw-primary-button" type="button" onClick={() => api.activatePilot(new Date().toISOString()).then(reload).catch((err) => onError(err.message))}>Activate 90-day pilot</button>}
      </section>

      <section className="gw-panel">
        <h2>Pending evidence</h2>
        {[...data.pendingCommute.map((row) => ({ ...row, type: 'commute' })), ...data.pendingCharging.map((row) => ({ ...row, type: 'charging' }))].map((row) => (
          <div className="gw-review-row" key={row.id}>
            <div className="gw-review-main"><strong>{row.type} · {row.participant_id}</strong><small>{row.commute_date || row.charging_date} · {row.session_identifier || row.origin_zone || ''}</small></div>
            <div className="gw-review-actions">
              <button className="gw-secondary-button approve" type="button" onClick={() => api.reviewEvidence(row.type, row.id, { decision: 'accepted', notes: 'manual review accepted' }).then(reload).catch((err) => onError(err.message))}>Accept</button>
              <button className="gw-secondary-button deny" type="button" onClick={() => api.reviewEvidence(row.type, row.id, { decision: 'denied', notes: 'manual review denied' }).then(reload).catch((err) => onError(err.message))}>Deny</button>
            </div>
          </div>
        ))}
        {data.duplicateFingerprints.length > 0 && <p className="gw-summary-warning">Duplicate evidence fingerprints: {data.duplicateFingerprints.map((row) => row.fingerprint.slice(0, 8)).join(', ')}</p>}
      </section>

      <section className="gw-panel">
        <h2>Redemption review</h2>
        {data.redemptionQueue.map((row) => (
          <div className="gw-review-row" key={row.id}>
            <div className="gw-review-main"><strong>{row.participant_id} · {row.credits} credits · {row.status}</strong><small>{row.delivery_method} · {row.history.map((item) => item.to_status).join(' → ')}</small></div>
            <div className="gw-review-actions">
              {row.status === 'requested' && <button className="gw-secondary-button" type="button" onClick={() => api.transition(row.id, { action: 'begin_review' }).then(reload).catch((err) => onError(err.message))}>Begin review</button>}
              {row.status === 'under_review' && <>
                <button className="gw-secondary-button approve" type="button" onClick={() => api.transition(row.id, { action: 'approve' }).then(reload).catch((err) => onError(err.message))}>Approve</button>
                <button className="gw-secondary-button deny" type="button" onClick={() => api.transition(row.id, { action: 'deny', reason: 'does not meet pilot rules' }).then(reload).catch((err) => onError(err.message))}>Deny</button>
              </>}
              {row.status === 'approved' && row.delivery_method === 'voucher' && <button className="gw-secondary-button" type="button" onClick={() => api.transition(row.id, { action: 'issue_benefit', delivery: { ...delivery, faceValueCents: row.benefit_cents } }).then(reload).catch((err) => onError(err.message))}>Record voucher</button>}
              {row.status === 'approved' && row.delivery_method === 'receipt' && <button className="gw-secondary-button" type="button" onClick={() => api.transition(row.id, { action: 'mark_session_verification_pending' }).then(reload).catch((err) => onError(err.message))}>Session verification</button>}
              {row.status === 'session_verification_pending' && <button className="gw-secondary-button" type="button" onClick={() => api.transition(row.id, { action: 'issue_benefit', delivery: { approvedAmountCents: row.benefit_cents, deliveryReference: delivery.deliveryReference, issueDate: delivery.issueDate, receiptConfirmation: 'admin verified receipt' } }).then(reload).catch((err) => onError(err.message))}>Issue receipt benefit</button>}
              {row.status === 'benefit_issued' && <button className="gw-secondary-button approve" type="button" onClick={() => api.transition(row.id, { action: 'settle' }).then(reload).catch((err) => onError(err.message))}>Settle</button>}
            </div>
          </div>
        ))}
        <div className="gw-form-row">
          <label>Voucher provider<input value={delivery.voucherProvider} onChange={(e) => setDelivery({ ...delivery, voucherProvider: e.target.value })} /></label>
          <label>Voucher identifier<input value={delivery.voucherIdentifier} onChange={(e) => setDelivery({ ...delivery, voucherIdentifier: e.target.value })} /></label>
          <label>Issue date<input type="date" value={delivery.issueDate} onChange={(e) => setDelivery({ ...delivery, issueDate: e.target.value })} /></label>
          <label>Expiration<input type="date" value={delivery.expirationDate} onChange={(e) => setDelivery({ ...delivery, expirationDate: e.target.value })} /></label>
          <label>Receipt delivery reference<input value={delivery.deliveryReference} onChange={(e) => setDelivery({ ...delivery, deliveryReference: e.target.value })} /></label>
        </div>
      </section>

      <section className="gw-panel">
        <h2>Active Hub Checklist</h2>
        {data.hubs.map((hub) => (
          <article key={hub.id} className="gw-checklist">
            <h3>{hub.name}</h3>
            <p>{hub.address_line}, {hub.city}, {hub.state} · {hub.verification_status} · {hub.activation_status}</p>
            <p>{hub.partnershipDisclaimer}</p>
            <ul>{hub.checklist.map((item) => (
              <li key={item.id}>
                <label>
                  <input type="checkbox" checked={Boolean(item.completed)} disabled={Boolean(item.completed)} onChange={() => api.completeChecklist(hub.id, item.item_key).then(reload).catch((err) => onError(err.message))} />
                  {item.label} {item.completed_by ? `· ${item.completed_by} · ${item.completed_at}` : ''}
                </label>
              </li>
            ))}</ul>
            <button className="gw-secondary-button" type="button" onClick={() => api.activateHub(hub.id).then(reload).catch((err) => onError(err.message))}>Activate hub</button>
          </article>
        ))}
      </section>

      <section className="gw-panel">
        <h2>Monthly reconciliation</h2>
        <div className="gw-form-row">
          <label>Month<input value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        </div>
        <button className="gw-primary-button" type="button" onClick={() => api.report(month).then(setReport).catch((err) => onError(err.message))}>Generate report</button>
        <a className="gw-secondary-button" href={api.reportCsvUrl(month)}>Download CSV</a>
        {report && <pre className="gw-report">{JSON.stringify(report, null, 2)}</pre>}
      </section>

      <section className="gw-panel">
        <h2>Audit history</h2>
        <ul className="gw-history-list">{data.audit.map((row) => <li key={row.id} className="gw-history-row"><div><strong>{row.action}</strong><span>{row.created_at} · {row.entity_type} · {row.correlation_id}</span></div></li>)}</ul>
      </section>
    </>
  );
}
