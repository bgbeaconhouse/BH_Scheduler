// Create frontend/src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface User {
  username: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setup: (username: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  loading: boolean;
  requiresSetup: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresSetup, setRequiresSetup] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = async () => {
    try {
      // Check if setup is required
      const setupResponse = await fetch(`${API_BASE_URL}/api/auth/setup-status`);
      const setupData = await setupResponse.json();
      
      if (setupData.requiresSetup) {
        setRequiresSetup(true);
        setLoading(false);
        return;
      }

      // Check for existing token
      const savedToken = localStorage.getItem('auth_token');
      if (savedToken) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
            headers: {
              'Authorization': `Bearer ${savedToken}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            setToken(savedToken);
            setUser(data.user);
          } else {
            localStorage.removeItem('auth_token');
          }
        } catch (error) {
          localStorage.removeItem('auth_token');
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Login failed');
    }

    const data = await response.json();
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('auth_token', data.token);
  };

  const setup = async (username: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Setup failed');
    }

    const data = await response.json();
    setToken(data.token);
    setUser(data.user);
    setRequiresSetup(false);
    localStorage.setItem('auth_token', data.token);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Password change failed');
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
  };

  const value = {
    user,
    token,
    login,
    logout,
    setup,
    changePassword,
    loading,
    requiresSetup,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};