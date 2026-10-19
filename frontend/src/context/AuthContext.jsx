import { createContext, useContext, useState } from 'react';
import api from '../api/client';
import { isInternalRole } from '../auth-policy.mjs';

const AuthContext = createContext(null);

// Safe JSON parse — corrupt localStorage crashes the app on every load without this
function safeParseUser() {
  try {
    const saved = localStorage.getItem('scmu_user');
    const user = saved ? JSON.parse(saved) : null;
    if (user && !isInternalRole(user.role)) { localStorage.removeItem('scmu_user'); localStorage.removeItem('scmu_token'); return null; }
    return user;
  } catch {
    // Corrupt data: clear it so the user is asked to log in again instead of getting a blank crash
    localStorage.removeItem('scmu_user');
    localStorage.removeItem('scmu_token');
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(safeParseUser);
  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('scmu_token', data.token);
      localStorage.setItem('scmu_user', JSON.stringify(data.user));
      setUser(data.user);
      return data;
    } catch (err) {
      // Re-throw so Login.jsx can display the correct error message
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('scmu_token');
    localStorage.removeItem('scmu_user');
    setUser(null);
  };

  const hasRole = (...roles) => user && roles.includes(user.role);
  const isAdmin = () => hasRole('SUPER_ADMIN', 'ADMIN');
  const isSuperAdmin = () => hasRole('SUPER_ADMIN');
  const canManage = isAdmin;

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, hasRole, isAdmin, isSuperAdmin, canManage }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
