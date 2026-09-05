export class ApiClientError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

const TOKEN_KEY = 'tb_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const isForm = options.body instanceof FormData;
  if (!isForm && options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const json = await res.json();
    if (!res.ok || json.success === false) {
      const err = json.error || {};
      if (res.status === 401 && !path.startsWith('/api/auth/')) {
        window.dispatchEvent(new Event('tb-auth-expired'));
      }
      throw new ApiClientError(err.code || 'ERROR', err.message || 'Request failed.', res.status);
    }
    return json.data;
  }

  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('tb-auth-expired'));
    throw new ApiClientError('ERROR', 'Request failed.', res.status);
  }

  return res;
}

export function apiGet(path) {
  return apiRequest(path);
}

export function apiPost(path, body) {
  return apiRequest(path, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body || {}),
  });
}

export function apiDelete(path) {
  return apiRequest(path, { method: 'DELETE' });
}

export async function apiBlob(path) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { headers });
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('tb-auth-expired'));
    let message = 'Download failed.';
    try {
      const json = await res.json();
      message = json.error?.message || message;
    } catch {
      /* binary error body */
    }
    throw new ApiClientError('EXPORT_FAILED', message, res.status);
  }
  return res.blob();
}
