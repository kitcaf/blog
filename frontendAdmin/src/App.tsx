/**
 * @file App.tsx
 * @description 应用根组件。
 *
 * 架构：
 *  - QueryClientProvider：为全应用提供 React Query 缓存上下文
 *  - 开发模式（VITE_USE_MOCK=true）：MockInitializer 将 mockData 水合进 Store，
 *    完全无需后端即可开发。
 *  - 生产/接入 Go 后端：Sidebar 的 usePageTreeQuery 在挂载时自动拉取数据，
 *    MockInitializer 不渲染（零开销）。
 *
 * 环境变量：
 *  VITE_USE_MOCK=true  → 使用 mockData（默认开启，开发阶段）
 *  VITE_API_BASE_URL   → Go 后端地址（默认 http://localhost:8080）
 */

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from '@/layouts';
import { MainContent } from '@/components/MainContent';
import { useBlockStore } from '@/store/useBlockStore';
import { initialMockData } from '@/mockData';
import './App.css';

// ─────────────────────────────────────────────────────────────────────────────
// React Query 全局配置
// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 失败后最多重试 2 次，延迟指数退避（最长 10s）
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),
      // 窗口重新聚焦时，超过 staleTime 才重新请求
      refetchOnWindowFocus: true,
    },
    mutations: {
      // 批量同步 mutation 不自动重试：
      // dirty 状态在同步失败时被保留，下次用户编辑触发防抖时会自动重试
      retry: 0,
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mock 数据初始化器（仅当 VITE_USE_MOCK=true 时渲染）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MockInitializer
 *
 * 纯前端开发模式（无 Go 后端）下，将 mockData 水合进 Zustand Store，
 * 模拟 Sidebar.usePageTreeQuery 成功加载的效果。
 *
 * 生产环境中此组件不渲染（条件渲染在 App 中通过 USE_MOCK 控制），
 * 因此 mockData 不会被打包进生产产物。
 */
function MockInitializer() {
  const hydrate = useBlockStore((s) => s.hydrate);
  const setActivePage = useBlockStore((s) => s.setActivePage);

  useEffect(() => {
    hydrate(initialMockData);

    // 默认激活第一个 page 块
    const firstPage = initialMockData.find((b) => b.type === 'page');
    const defaultId = firstPage?.id ?? initialMockData[0]?.id;
    if (defaultId) setActivePage(defaultId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 仅挂载时执行一次（hydrate/setActivePage 是稳定引用，无需列入依赖）

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 应用根组件
// ─────────────────────────────────────────────────────────────────────────────

/** 环境变量控制：true → mock 模式，false → 真实 API 模式 */
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* Mock 模式下初始化假数据（生产环境不渲染） */}
        {USE_MOCK && <MockInitializer />}
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<MainContent />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
