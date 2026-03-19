import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api';
import {
  AUTH_SESSION_CLEARED_EVENT,
  clearAuthSession,
  getStoredExpiresAt,
  getStoredToken,
  persistAuthSession
} from '../utils/authStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if user is logged in on mount
  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      authApi.me()
        .then(userData => {
          setUser(userData);
        })
        .catch(() => {
          clearAuthSession();
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleSessionCleared = () => {
      setUser(null);
    };

    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
    return () => window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const token = getStoredToken();
    const expiresAt = getStoredExpiresAt(token);

    if (!expiresAt) return undefined;

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      clearAuthSession();
      setUser(null);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      clearAuthSession();
      setUser(null);
    }, remaining);

    return () => window.clearTimeout(timeoutId);
  }, [user]);

  const login = useCallback(async (username, password) => {
    const { token, expiresAt, user: userData } = await authApi.login(username, password);
    persistAuthSession(token, expiresAt);
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(() => {
    clearAuthSession();
    setUser(null);
  }, []);

  const isAdmin = user?.role === 'admin';

  // Check if user owns a resource
  const isOwner = useCallback((resourceUserId) => {
    if (!user) return false;
    if (isAdmin) return true;
    return user.id === resourceUserId;
  }, [user, isAdmin]);

  const value = {
    user,
    loading,
    login,
    logout,
    isAdmin,
    isOwner,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
