import { create } from 'zustand';

interface SidebarStore {
  isOpen: boolean;
  width: number;
  setIsOpen: (isOpen: boolean) => void;
  setWidth: (width: number) => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  isOpen: true,
  width: 240, // 默认宽度 240px
  setIsOpen: (isOpen: boolean) => set({ isOpen }),
  setWidth: (width: number) => set({ width }),
}));
