const csrfStorage = 'pilot_csrf';

async function request(path, { method = 'GET', body, headers } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: {
      'x-csrf-token': sessionStorage.getItem(csrfStorage) || '',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(data.message || data.error || 'Request failed');
    error.status = response.status;
    error.code = data.error;
    throw error;
  }
  return data;
}

export function setCsrf(token) {
  if (token) sessionStorage.setItem(csrfStorage, token);
}

export const api = {
  login: (email, password) => request('/api/login', { method: 'POST', body: { email, password } }).then((data) => {
    setCsrf(data.csrfToken);
    return data;
  }),
  logout: () => request('/api/logout', { method: 'POST' }),
  session: () => request('/api/session').then((data) => {
    setCsrf(data.csrfToken);
    return data;
  }),
  participant: () => request('/api/participant/dashboard'),
  commute: (body) => request('/api/participant/commute-evidence', { method: 'POST', body }),
  charging: (body) => request('/api/participant/charging-evidence', { method: 'POST', body }),
  redeem: (body) => request('/api/participant/redemptions', { method: 'POST', body }),
  confirmReceipt: (id) => request(`/api/participant/redemptions/${id}/confirm-receipt`, { method: 'POST', body: {} }),
  uploadEvidence: (body) => request('/api/participant/evidence-files', { method: 'POST', body }),
  admin: () => request('/api/admin/dashboard'),
  activatePilot: (effectiveAt) => request('/api/admin/pilot/activate', { method: 'POST', body: { effectiveAt } }),
  completeChecklist: (hubId, itemKey) => request(`/api/admin/hubs/${hubId}/checklist/${itemKey}`, { method: 'POST', body: {} }),
  activateHub: (hubId) => request(`/api/admin/hubs/${hubId}/activate`, { method: 'POST', body: {} }),
  reviewEvidence: (type, id, body) => request(`/api/admin/evidence/${type}/${id}/review`, { method: 'POST', body }),
  transition: (id, body) => request(`/api/admin/redemptions/${id}/transition`, { method: 'POST', body }),
  enroll: (id) => request(`/api/admin/participants/${id}/enroll`, { method: 'POST', body: {} }),
  report: (month) => request(`/api/admin/reports/monthly?month=${month}`),
  reportCsvUrl: (month) => `/api/admin/reports/monthly?month=${month}&format=csv`,
  companions: () => request('/api/admin/companions'),
  ingestRelayRiderFeed: (feed) => request('/api/admin/companions/relay-rider/ingest-feed', { method: 'POST', body: feed ? { feed } : {} }),
};
