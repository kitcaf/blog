/**
 * @file App.tsx
 * @description 应用根组件
 *
 * 架构：
 *  - QueryClientProvider：为全应用提供 React Query 缓存上下文
 *  - 路由保护：ProtectedRoute 检查登录状态
 *  - 基于路由的页面导航
 *
 * 环境变量：
 *  VITE_API_BASE_URL → Go 后端地址（默认 http://localhost:8080/api）
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/layouts';
import { MainContent } from '@/components/MainContent';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import { Toaster } from 'sonner';
import './App.css';

// ─────────────────────────────────────────────────────────────────────────────
// React Query 全局配置
// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 应用根组件
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* 公开路由 */}
          <Route path="/login" element={<Login />} />
          
          {/* 受保护的路由 */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Layout />}>
              <Route index element={<MainContent />} />
              <Route path="page/:pageId" element={<MainContent />} />
            </Route>
          </Route>

          {/* 404 重定向 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      
      {/* 挂载全局 Sonner 通知 */}
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}

export default App;
