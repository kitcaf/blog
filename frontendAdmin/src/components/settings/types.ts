/**
 * @file types.ts
 * @description 设置模块共享类型定义
 */

import type { LucideIcon } from 'lucide-react';

export type SettingsSectionId = 'theme';

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}
