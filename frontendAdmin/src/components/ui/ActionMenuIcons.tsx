/**
 * @file ActionMenuIcons.tsx
 * @description Predefined icon mapping for ActionMenu component
 */

import { 
  Copy, 
  Trash2, 
  Edit3, 
  ExternalLink,
  Star,
  CopyPlus,
  ArrowRight,
  RefreshCw,
  PanelRightOpen,
  FolderPlus,
  FilePlus2,
  Send,
} from 'lucide-react';

export const ActionMenuIcons = {
  copyLink: <Copy size={13} />,
  duplicate: <CopyPlus size={13} />,
  rename: <Edit3 size={13} />,
  moveTo: <ArrowRight size={13} />,
  trash: <Trash2 size={13} />,
  wiki: <RefreshCw size={13} />,
  newTab: <ExternalLink size={13} />,
  sidePeek: <PanelRightOpen size={13} />,
  star: <Star size={13} />,
  createFolder: <FolderPlus size={13} />,
  createPage: <FilePlus2 size={13} />,
  publish: <Send size={13} />,
};
