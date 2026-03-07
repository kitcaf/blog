/**
 * @file client.ts
 * @description 统一的 axios HTTP 客户端实例。
 *
 * 职责：
 *  - 统一配置 baseURL（可通过环境变量覆盖）
 *  - 设置合理的请求超时
 *  - 请求拦截：注入 Access Token
 *  - 响应拦截：统一错误处理，401 时自动刷新 Token
 */

import axios, { type InternalAxiosRequestConfig, type AxiosError } from 'axios';
import { useAuthStore } from '@/store/useAuthStore';

/** 所有 API 请求的根路径，开发时指向 Go 后端，可被 .env 覆盖 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api';

export const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 标记是否正在刷新 token
let isRefreshing = false;
// 存储等待刷新完成的请求
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

// 处理等待队列
const processQueue = (error: unknown = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve();
    }
  });
  failedQueue = [];
};

// ── 请求拦截器：注入 Access Token ──────────────────────────────────────────────

client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const accessToken = localStorage.getItem('access_token');
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// ── 响应拦截器：统一错误处理 + 自动刷新 Token ────────────────────────────────────────────────

client.interceptors.response.use(
  (response) => {
    // 后端统一响应格式：{ code, message, data }
    // 提取 data 字段，让调用方直接使用
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      return { ...response, data: response.data.data };
    }
    return response;
  },
  async (error: AxiosError<{ code: number; message: string }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const response = error.response;

    // 401 未授权：尝试刷新 token
    if (response?.status === 401 && !originalRequest._retry) {
      // 如果是 refresh 接口本身失败，直接跳转登录
      if (originalRequest.url?.includes('/auth/refresh')) {
        const clearAuth = useAuthStore.getState().clearAuth;
        clearAuth();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      // 标记请求已重试
      originalRequest._retry = true;

      if (isRefreshing) {
        // 如果正在刷新，将请求加入队列
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            // 刷新成功后，使用新 token 重试请求
            const newAccessToken = localStorage.getItem('access_token');
            if (originalRequest.headers && newAccessToken) {
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            }
            return client(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      // 尝试刷新 token
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        // 没有 refresh token，直接跳转登录
        const clearAuth = useAuthStore.getState().clearAuth;
        clearAuth();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      try {
        // 调用刷新接口
        const refreshResponse = await axios.post(
          `${BASE_URL}/auth/refresh`,
          { refresh_token: refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        const { access_token, refresh_token } = refreshResponse.data.data;

        // 更新 store 中的 token
        const state = useAuthStore.getState();
        if (state.user) {
          useAuthStore.getState().setAuth(access_token, refresh_token, state.user);
        }

        // 处理等待队列
        processQueue();

        // 重试原请求
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }
        return client(originalRequest);
      } catch (refreshError) {
        // 刷新失败，清除认证状态并跳转登录
        processQueue(refreshError);
        const clearAuth = useAuthStore.getState().clearAuth;
        clearAuth();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // 提取错误消息
    const message = response?.data?.message ?? error.message ?? '请求失败';

    // 返回包含完整信息的错误
    return Promise.reject({
      message,
      code: response?.data?.code ?? response?.status,
      response,
    });
  }
);

// 兼容旧的导出名
export const apiClient = client;
