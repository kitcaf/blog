/**
 * @file client.ts
 * @description 统一的 axios HTTP 客户端实例。
 *
 * 职责：
 *  - 统一配置 baseURL（可通过环境变量覆盖）
 *  - 设置合理的请求超时
 *  - 请求拦截：注入 Auth Token（预留 JWT 接入点）
 *  - 响应拦截：统一把 HTTP 错误转为 JS Error，上层 React Query 自动重试
 */

import axios, { type InternalAxiosRequestConfig } from 'axios';

/** 所有 API 请求的根路径，开发时指向 Go 后端，可被 .env 覆盖 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── 请求拦截器 ──────────────────────────────────────────────────────────────

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // TODO（阶段七 Auth）：从 localStorage / cookie 读取 JWT，注入 Authorization Header
  // const token = localStorage.getItem('admin_token');
  // if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── 响应拦截器 ──────────────────────────────────────────────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // 将 axios error 转为统一格式，方便 React Query 的 error boundary 捕获
    const message: string =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (error?.response?.data as { message?: string })?.message ??
      error?.message ??
      'Unknown API error';
    return Promise.reject(new Error(message));
  },
);
