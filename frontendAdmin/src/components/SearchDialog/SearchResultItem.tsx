/**
 * @file SearchResultItem.tsx
 * @description 搜索结果项组件
 */

import { useCallback } from 'react';
import type { FlattenedItem } from './hooks/useFlattenedResults';

interface SearchResultItemProps {
    item: FlattenedItem;
    index: number;
    isSelected: boolean;
    onSelect: (pageId: string) => void;
}

function SearchResultItem({
    item,
    index,
    isSelected,
    onSelect,
}: SearchResultItemProps) {
    const handleClick = useCallback(() => {
        if (item.type === 'result' && item.result) {
            onSelect(item.result.page_id);
        }
    }, [item, onSelect]);

    // 渲染分组标题
    if (item.type === 'header') {
        return (
            <div className="px-2 py-2">
                <div className="text-xs font-semibold text-app-fg-light uppercase tracking-wide">
                    {item.title}
                </div>
            </div>
        );
    }

    // 渲染结果项
    if (!item.result) return null;

    const previewContent =
        item.result.representative_block?.content || item.result.top_blocks?.[0]?.content;

    return (
        <button
            data-index={index}
            onClick={handleClick}
            className={`w-full px-4 py-3 flex items-start gap-3 rounded-xl transition-colors duration-150 ${
                isSelected ? 'bg-app-hover' : 'hover:bg-app-hover/60'
            }`}
        >
            <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    {item.result.page_icon && (
                        <span className="text-lg shrink-0">{item.result.page_icon}</span>
                    )}
                    <span className="text-sm font-medium text-app-fg-deeper truncate">
                        {item.result.page_title}
                    </span>
                </div>
                {previewContent && (
                    <div className="text-xs text-app-fg-light leading-relaxed line-clamp-2 pl-7">
                        {previewContent}
                    </div>
                )}
            </div>
        </button>
    );
}

export default SearchResultItem;
