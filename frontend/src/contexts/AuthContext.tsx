import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  saveSession: (token: string, user: User) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readUser(): User | null {
  try {
    const stored = sessionStorage.getItem('stackpulse_user');
    return stored ? JSON.parse(stored) as User : null;
  } catch {
    sessionStorage.removeItem('stackpulse_user');
    sessionStorage.removeItem('stackpulse_token');
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(readUser);

  const signOut = useCallback(() => {
    sessionStorage.removeItem('stackpulse_token');
    sessionStorage.removeItem('stackpulse_user');
    setUser(null);
  }, []);

  const saveSession = useCallback((token: string, nextUser: User) => {
    sessionStorage.setItem('stackpulse_token', token);
    sessionStorage.setItem('stackpulse_user', JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      signOut();
      navigate('/login', { replace: true, state: { expired: true } });
    };
    window.addEventListener('stackpulse:unauthorized', onUnauthorized);
    return () => window.removeEventListener('stackpulse:unauthorized', onUnauthorized);
  }, [navigate, signOut]);

  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(user && sessionStorage.getItem('stackpulse_token')),
    saveSession,
    signOut,
  }), [user, saveSession, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
