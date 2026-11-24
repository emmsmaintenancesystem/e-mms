import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  clearStoredAuth,
  fetchCurrentUser,
  getStoredToken,
  getStoredUser,
  loginStaff,
  setStoredAuth,
} from '../lib/apiClient';
import { StaffRole, User } from '../types/api';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
  hasRole: (...allowedRoles: StaffRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    const existingToken = getStoredToken();
    if (!existingToken) {
      setIsLoading(false);
      return;
    }

    fetchCurrentUser()
      .then((res) => {
        if (!active) return;
        setUser(res.user);
        setStoredAuth(existingToken, res.user);
      })
      .catch(() => {
        if (!active) return;
        clearStoredAuth();
        setUser(null);
        setToken(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = async (username: string, password: string): Promise<User> => {
    const res = await loginStaff(username, password);
    setStoredAuth(res.token, res.user);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    clearStoredAuth();
    setToken(null);
    setUser(null);
  };

  const hasRole = (...allowedRoles: StaffRole[]): boolean => {
    if (!user) return false;
    return allowedRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
