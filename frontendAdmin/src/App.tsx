import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from '@/layouts';
import { MainContent } from '@/components/MainContent';
import { useBlockStore } from '@/store/useBlockStore';
import { initialMockData } from '@/mockData';
import './App.css';

/**
 * StoreInitializer：在应用挂载时将 mock 数据水合进 Zustand Store。
 * 阶段六接入 API 后，此处替换为 React Query useQuery 的 onSuccess 回调。
 * 使用独立组件的好处：逻辑与路由/布局树完全解耦。
 */
function StoreInitializer() {
  // 直接订阅单个 action（稳定引用，不触发 re-render）而不用 selectActions 返回新对象
  const hydrate = useBlockStore((s) => s.hydrate);
  const setActivePage = useBlockStore((s) => s.setActivePage);

  useEffect(() => {
    hydrate(initialMockData);

    // 找到第一个 page 块作为默认活跃页
    const firstPage = initialMockData.find((b) => b.type === 'page');
    const fallback = initialMockData[0];
    const defaultId = firstPage?.id ?? fallback?.id;
    if (defaultId) setActivePage(defaultId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 仅挂载时执行一次

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <StoreInitializer />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<MainContent />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
