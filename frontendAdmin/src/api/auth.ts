import { client } from './client';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    username: string;
    email: string;
  };
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

// 登录
export const login = async (data: LoginRequest): Promise<AuthResponse> => {
  const response = await client.post<AuthResponse>('/auth/login', data);
  return response.data;
};

// 注册
export const register = async (data: RegisterRequest): Promise<{ user: User }> => {
  const response = await client.post<{ user: User }>('/auth/register', data);
  return response.data;
};

// 刷新 Token
export const refreshToken = async (refreshToken: string): Promise<RefreshResponse> => {
  const response = await client.post<RefreshResponse>('/auth/refresh', {
    refresh_token: refreshToken,
  });
  return response.data;
};

// 获取当前用户信息
export const getCurrentUser = async (): Promise<User> => {
  const response = await client.get<User>('/auth/me');
  return response.data;
};

// 登出
export const logout = async (refreshToken?: string): Promise<void> => {
  await client.post('/auth/logout', refreshToken ? { refresh_token: refreshToken } : {});
};
