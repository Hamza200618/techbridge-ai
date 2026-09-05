import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/auth';
import { getToken, setToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  async function loadMe() {
    if (!getToken()) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      const data = await authApi.me();
      setUser(data.user);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    loadMe();
    const onExpired = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener('tb-auth-expired', onExpired);
    return () => window.removeEventListener('tb-auth-expired', onExpired);
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      async login(payload) {
        const data = await authApi.login(payload);
        setToken(data.token);
        setUser(data.user);
        return data;
      },
      async register(payload) {
        return authApi.register(payload);
      },
      async logout() {
        try {
          await authApi.logout();
        } finally {
          setToken(null);
          setUser(null);
        }
      },
    }),
    [user, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
