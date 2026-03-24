/**
 * @file TrashItem.tsx
 * @description 回收站项目组件
 */

import { Folder, FileText, RotateCcw, AlertCircle } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import type { TrashItem as TrashItemType } from '@/api/trash';

// 配置 dayjs
dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

interface TrashItemProps {
  item: TrashItemType;
  isSelected: boolean;
  onToggleSelect: () => void;
  onRestore: () => void;
  onDelete: () => void;
  isRestoring: boolean;
  isDeleting: boolean;
}

export default function TrashItem({
  item,
  isSelected,
  onToggleSelect,
  onRestore,
  onDelete,
  isRestoring,
  isDeleting,
}: TrashItemProps) {
  const Icon = item.type === 'folder' ? Folder : FileText;
  
  // 构建子项描述
  const childrenText = [];
  if (item.child_folder_count > 0) {
    childrenText.push(`${item.child_folder_count} 个文件夹`);
  }
  if (item.child_page_count > 0) {
    childrenText.push(`${item.child_page_count} 篇文章`);
  }

  return (
    <button
      onClick={onToggleSelect}
      className={`w-full px-4 py-4 flex items-center gap-4 rounded-xl transition-all duration-150 ${
        isSelected 
          ? 'bg-app-hover border border-primary' 
          : 'border border-transparent hover:bg-app-hover/60'
      }`}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        className="w-4 h-4 rounded border-border shrink-0 cursor-pointer"
      />

      {/* Icon & Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-2xl shrink-0">{item.icon}</span>
        <Icon className="w-4 h-4 text-app-fg-light shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <div className="font-medium text-app-fg-deeper truncate text-sm">
            {item.title}
          </div>
          <div className="flex items-center gap-2 text-xs text-app-fg-light mt-1">
            <span>删除于 {dayjs(item.deleted_at).fromNow()}</span>
            {childrenText.length > 0 && (
              <>
                <span>•</span>
                <span>包含 {childrenText.join('、')}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRestore();
          }}
          disabled={isRestoring || isDeleting}
          className="p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/20 text-green-600 dark:text-green-400 disabled:opacity-50 transition-colors"
          title="恢复"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={isRestoring || isDeleting}
          className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 disabled:opacity-50 transition-colors"
          title="永久删除"
        >
          <AlertCircle className="w-4 h-4" />
        </button>
      </div>
    </button>
  );
}
