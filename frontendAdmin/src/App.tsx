/**
 * @file App.tsx
 * @description 应用根组件。
 *
 * 架构：
 *  - QueryClientProvider：为全应用提供 React Query 缓存上下文
 *  - 路由保护：ProtectedRoute 检查登录状态
 *  - 开发模式（VITE_USE_MOCK=true）：MockInitializer 将 mockData 水合进 Store
 *
 * 环境变量：
 *  VITE_USE_MOCK=true  → 使用 mockData（默认开启，开发阶段）
 *  VITE_API_BASE_URL   → Go 后端地址（默认 http://localhost:8080/api）
 */

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/layouts';
import { MainContent } from '@/components/MainContent';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import { useBlockStore } from '@/store/useBlockStore';
import { initialMockData } from '@/mockData';
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
// Mock 数据初始化器
// ─────────────────────────────────────────────────────────────────────────────

function MockInitializer() {
  const hydrate = useBlockStore((s) => s.hydrate);
  const setActivePage = useBlockStore((s) => s.setActivePage);

  useEffect(() => {
    hydrate(initialMockData);
    const firstPage = initialMockData.find((b) => b.type === 'page');
    const defaultId = firstPage?.id ?? initialMockData[0]?.id;
    if (defaultId) setActivePage(defaultId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 应用根组件
// ─────────────────────────────────────────────────────────────────────────────

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {USE_MOCK && <MockInitializer />}
        <Routes>
          {/* 公开路由 */}
          <Route path="/login" element={<Login />} />
          
          {/* 受保护的路由 */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Layout />}>
              <Route index element={<MainContent />} />
            </Route>
          </Route>

          {/* 404 重定向 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
