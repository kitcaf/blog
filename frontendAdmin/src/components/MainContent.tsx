/**
 * @file MainContent.tsx
 * @description 主内容区：包含 Tiptap 富文本编辑器，从 Zustand Store 读取活跃页面数据。
 */
import { useBlockStore } from '@/store/useBlockStore';
import { TiptapEditor } from './editor/TiptapEditor';

export function MainContent() {
  const activePageId = useBlockStore((s) => s.activePageId);

  if (!activePageId) {
    return (
      <main className="flex-1 h-full bg-app-bg overflow-y-auto relative">
        <div className="flex flex-col items-center justify-center h-full gap-3 text-app-fg-light select-none">
          <div className="text-5xl opacity-20">📝</div>
          <p className="text-sm">从侧边栏选择一个页面，或新建页面开始创作</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 h-full bg-app-bg overflow-y-auto relative">
      <div className="max-w-[700px] mx-auto px-8 py-16 md:py-24 pb-48">
        <TiptapEditor />
      </div>
    </main>
  );
}
