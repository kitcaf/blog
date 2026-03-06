import { create } from 'zustand';

interface SidebarStore {
  isOpen: boolean;
  width: number;
  isResizing: boolean;
  setIsOpen: (isOpen: boolean) => void;
  setWidth: (width: number) => void;
  setIsResizing: (isResizing: boolean) => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  isOpen: true,
  width: 240, // 默认宽度 240px
  isResizing: false,
  setIsOpen: (isOpen: boolean) => set({ isOpen }),
  setWidth: (width: number) => set({ width }),
  setIsResizing: (isResizing: boolean) => set({ isResizing }),
}));
