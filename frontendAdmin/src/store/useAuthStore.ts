import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  username: string;
  email: string;
  avatar_url?: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  
  // Actions
  setAuth: (accessToken: string, refreshToken: string, user: User) => void;
  setAccessToken: (accessToken: string) => void;
  clearAuth: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      setAuth: (accessToken, refreshToken, user) => {
        set({ accessToken, refreshToken, user, isAuthenticated: true });
        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', accessToken);
          localStorage.setItem('refresh_token', refreshToken);
        }
      },

      setAccessToken: (accessToken) => {
        set({ accessToken });
        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', accessToken);
        }
      },

      clearAuth: () => {
        set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('auth-storage');
        }
      },

      updateUser: (userData) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        }));
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      // 从 localStorage 恢复后，验证 token 是否存在
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (state.accessToken && state.refreshToken && state.user) {
            state.isAuthenticated = true;
          } else {
            state.isAuthenticated = false;
            state.accessToken = null;
            state.refreshToken = null;
            state.user = null;
          }
        }
      },
    }
  )
);
