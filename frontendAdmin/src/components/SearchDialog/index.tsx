/**
 * @file index.tsx
 * @description 全局搜索对话框入口
 * 
 * 特性：
 * - 上下文保持：关闭后再打开保留搜索内容
 * - 自动全选：打开时自动选中输入框内容，方便快速替换
 * - 键盘导航：支持上下键、Enter、Esc
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchQuery } from '@/hooks/useSearchQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { useFlattenedResults } from './hooks/useFlattenedResults';
import { DialogContent, DialogOverlay, DialogRoot } from '@/components/dialog';
import SearchInput from './SearchInput';
import SearchSkeleton from './Skeleton';
import SearchResultItem from './SearchResultItem.tsx';
import { Search } from 'lucide-react';

interface SearchDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SearchDialog({ isOpen, onClose }: SearchDialogProps) {
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);
    const prevIsOpenRef = useRef(isOpen);

    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const debouncedQuery = useDebounce(query, 300);

    // 搜索查询
    const { data: results = [], isLoading, isError } = useSearchQuery(
        debouncedQuery,
        debouncedQuery.trim().length > 0
    );

    // 扁平化结果用于渲染（包含分组标题）
    const flattenedItems = useFlattenedResults(results);

    // 当对话框打开时聚焦并全选输入框内容（保持上下文）
    useEffect(() => {
        if (isOpen && !prevIsOpenRef.current) {
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            });
        }
        prevIsOpenRef.current = isOpen;
    }, [isOpen]);

    // 当搜索结果变化时，选中第一个结果项（使用 ref 避免级联渲染）
    const prevFlattenedLengthRef = useRef(0);
    useEffect(() => {
        if (flattenedItems.length !== prevFlattenedLengthRef.current) {
            prevFlattenedLengthRef.current = flattenedItems.length;
            
            // 使用 queueMicrotask 延迟状态更新
            queueMicrotask(() => {
                const firstIndex = flattenedItems.findIndex(item => item.type === 'result');
                if (firstIndex >= 0) {
                    setSelectedIndex(firstIndex);
                }
            });
        }
    }, [flattenedItems]);

    // 选择结果
    const handleSelectResult = useCallback((pageId: string) => {
        navigate(`/page/${pageId}`);
        onClose();
    }, [navigate, onClose]);

    // 键盘导航（跳过标题项）
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const currentItem = flattenedItems[selectedIndex];
            if (currentItem?.type === 'result' && currentItem.result) {
                handleSelectResult(currentItem.result.page_id);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            for (let i = selectedIndex + 1; i < flattenedItems.length; i++) {
                if (flattenedItems[i].type === 'result') {
                    setSelectedIndex(i);
                    break;
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            for (let i = selectedIndex - 1; i >= 0; i--) {
                if (flattenedItems[i].type === 'result') {
                    setSelectedIndex(i);
                    break;
                }
            }
        }
    }, [flattenedItems, selectedIndex, handleSelectResult, onClose]);

    // 滚动到选中项
    useEffect(() => {
        if (flattenedItems.length === 0) return;

        const selectedElement = resultsRef.current?.querySelector(
            `[data-index="${selectedIndex}"]`
        );
        selectedElement?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex, flattenedItems.length]);

    if (!isOpen) return null;

    return (
        <DialogRoot open={isOpen} onClose={onClose}>
            <DialogOverlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" />

            <DialogContent className="fixed left-1/2 top-1/2 z-50 flex h-[80vh] w-[90vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-app-bg shadow-2xl animate-in zoom-in-95 duration-200">
                {/* 搜索输入框 */}
                <SearchInput
                    ref={inputRef}
                    query={query}
                    isLoading={isLoading}
                    onQueryChange={setQuery}
                    onKeyDown={handleKeyDown}
                    onClose={onClose}
                />

                {/* 搜索结果 */}
                <div
                    ref={resultsRef}
                    className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3"
                >
                    {!debouncedQuery ? (
                        <EmptyState icon={Search} message="输入关键词开始搜索" />
                    ) : isLoading ? (
                        <SearchSkeleton />
                    ) : isError ? (
                        <EmptyState message="搜索失败，请稍后重试" />
                    ) : results.length === 0 ? (
                        <EmptyState message="未找到相关内容" />
                    ) : (
                        <div className="space-y-4">
                            {flattenedItems.map((item, index) => (
                                <SearchResultItem
                                    key={item.type === 'header' ? `header-${item.title}` : `result-${item.result?.page_id}`}
                                    item={item}
                                    index={index}
                                    isSelected={selectedIndex === index}
                                    onSelect={handleSelectResult}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* 底部提示 */}
                <div className="px-5 py-3 border-t border-border/50 bg-app-bg/50 shrink-0">
                    <div className="text-xs text-app-fg-light flex items-center justify-center gap-4">
                        <span>
                            <kbd className="px-1.5 py-0.5 rounded bg-app-hover text-app-fg-deeper font-mono text-xs">↑↓</kbd> 导航
                        </span>
                        <span>
                            <kbd className="px-1.5 py-0.5 rounded bg-app-hover text-app-fg-deeper font-mono text-xs">Enter</kbd> 选择
                        </span>
                        <span>
                            <kbd className="px-1.5 py-0.5 rounded bg-app-hover text-app-fg-deeper font-mono text-xs">Esc</kbd> 关闭
                        </span>
                    </div>
                </div>
            </DialogContent>
        </DialogRoot>
    );
}

// 空状态组件
interface EmptyStateProps {
    icon?: React.ComponentType<{ className?: string }>;
    message: string;
}

function EmptyState({ icon: Icon, message }: EmptyStateProps) {
    return (
        <div className="flex items-center justify-center h-full">
            <div className="text-center text-app-fg-light text-sm">
                {Icon && <Icon className="w-12 h-12 mx-auto mb-3 opacity-40" />}
                <p>{message}</p>
            </div>
        </div>
    );
}
