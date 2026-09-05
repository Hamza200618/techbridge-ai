import { apiGet, apiPost } from './client';

export const authApi = {
  register: (payload) => apiPost('/api/auth/register', payload),
  login: (payload) => apiPost('/api/auth/login', payload),
  logout: () => apiPost('/api/auth/logout', {}),
  me: () => apiGet('/api/auth/me'),
};
