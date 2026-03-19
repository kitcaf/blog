/**
 * @file SearchDialog.tsx
 * @description 全局搜索对话框组件
 * 
 * 功能：
 * - 支持 Ctrl+P 快捷键唤起
 * - 实时搜索页面（对接 /api/admin/search）
 * - 按时间分组显示结果
 * - 键盘导航支持（上下键选择，Enter 确认，Esc 关闭）
 * 
 * 性能优化：
 * - React Query 缓存搜索结果（30秒内不重复请求）
 * - React.memo 优化结果项渲染
 * - useCallback 避免不必要的重渲染
 * - 防抖搜索减少请求（300ms）
 * - 使用 key 强制重新挂载避免复杂状态管理
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, X, Loader2 } from 'lucide-react';
import { useSearchQuery } from '@/hooks/useSearchQuery';
import { useDebounce } from '@/hooks/useDebounce';
import type { SearchResult } from '@/api/search';

interface SearchDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

function SearchDialogInner({ onClose }: { onClose: () => void }) {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebounce(query, 300);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);

    // 搜索查询（使用 React Query 缓存，避免重复请求）
    const { data: results = [], isLoading, isError } = useSearchQuery(
        debouncedQuery,
        debouncedQuery.trim().length > 0
    );

    // 按时间分组（今天、上周、过去30天、更早）
    const groupedResults = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

        const groups = {
            today: [] as SearchResult[],
            lastWeek: [] as SearchResult[],
            last30Days: [] as SearchResult[],
            older: [] as SearchResult[],
        };

        results.forEach((result) => {
            const updatedAt = new Date(result.updated_at);
            if (updatedAt >= today) {
                groups.today.push(result);
            } else if (updatedAt >= lastWeek) {
                groups.lastWeek.push(result);
            } else if (updatedAt >= last30Days) {
                groups.last30Days.push(result);
            } else {
                groups.older.push(result);
            }
        });

        return groups;
    }, [results]);

    // 扁平化结果用于键盘导航
    const flatResults = useMemo(() => results, [results]);

    // 当结果变化时重置选中索引
    useEffect(() => {
        setSelectedIndex(0);
    }, [flatResults.length]);

    // 聚焦输入框
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // 选择结果
    const handleSelectResult = useCallback(
        (pageId: string) => {
            navigate(`/page/${pageId}`);
            onClose();
        },
        [navigate, onClose]
    );

    // 键盘导航
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter' && flatResults[selectedIndex]) {
                e.preventDefault();
                handleSelectResult(flatResults[selectedIndex].page_id);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        },
        [flatResults, selectedIndex, handleSelectResult, onClose]
    );

    // 滚动到选中项（平滑滚动）
    useEffect(() => {
        if (flatResults.length === 0) return;

        const selectedElement = resultsRef.current?.querySelector(
            `[data-index="${selectedIndex}"]`
        );
        selectedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selectedIndex, flatResults.length]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="w-full max-w-2xl bg-app-bg rounded-xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 搜索输入框 */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                    <Search className="w-5 h-5 text-app-fg-light shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="在您的文章空间中搜索..."
                        className="flex-1 bg-transparent text-app-fg-deeper placeholder:text-app-fg-light outline-none text-base"
                    />
                    {isLoading && <Loader2 className="w-4 h-4 text-app-fg-light animate-spin" />}
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-app-hover transition-colors"
                    >
                        <X className="w-4 h-4 text-app-fg-light" />
                    </button>
                </div>

                {/* 搜索结果 */}
                <div
                    ref={resultsRef}
                    className="max-h-[60vh] overflow-y-auto overflow-x-hidden"
                >
                    {!debouncedQuery ? (
                        <div className="px-4 py-8 text-center text-app-fg-light text-sm">
                            输入关键词开始搜索
                        </div>
                    ) : isError ? (
                        <div className="px-4 py-8 text-center text-app-fg-light text-sm">
                            搜索失败，请稍后重试
                        </div>
                    ) : flatResults.length === 0 && !isLoading ? (
                        <div className="px-4 py-8 text-center text-app-fg-light text-sm">
                            未找到相关内容
                        </div>
                    ) : (
                        <>
                            {groupedResults.today.length > 0 && (
                                <SearchResultGroup
                                    title="今天"
                                    results={groupedResults.today}
                                    selectedIndex={selectedIndex}
                                    onSelect={handleSelectResult}
                                    startIndex={0}
                                />
                            )}
                            {groupedResults.lastWeek.length > 0 && (
                                <SearchResultGroup
                                    title="上周"
                                    results={groupedResults.lastWeek}
                                    selectedIndex={selectedIndex}
                                    onSelect={handleSelectResult}
                                    startIndex={groupedResults.today.length}
                                />
                            )}
                            {groupedResults.last30Days.length > 0 && (
                                <SearchResultGroup
                                    title="过去 30 天"
                                    results={groupedResults.last30Days}
                                    selectedIndex={selectedIndex}
                                    onSelect={handleSelectResult}
                                    startIndex={groupedResults.today.length + groupedResults.lastWeek.length}
                                />
                            )}
                            {groupedResults.older.length > 0 && (
                                <SearchResultGroup
                                    title="更早"
                                    results={groupedResults.older}
                                    selectedIndex={selectedIndex}
                                    onSelect={handleSelectResult}
                                    startIndex={
                                        groupedResults.today.length +
                                        groupedResults.lastWeek.length +
                                        groupedResults.last30Days.length
                                    }
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export function SearchDialog({ isOpen, onClose }: SearchDialogProps) {
    // 使用 key 强制重新挂载，避免复杂的状态重置逻辑
    // 每次打开对话框都会生成新的 key，确保状态完全重置
    const [mountKey] = useState(() => Math.random().toString(36).slice(2));
    
    if (!isOpen) return null;
    
    return <SearchDialogInner key={mountKey} onClose={onClose} />;
}

// 搜索结果分组组件
interface SearchResultGroupProps {
    title: string;
    results: SearchResult[];
    selectedIndex: number;
    onSelect: (pageId: string) => void;
    startIndex: number;
}

function SearchResultGroup({
    title,
    results,
    selectedIndex,
    onSelect,
    startIndex,
}: SearchResultGroupProps) {
    const handleClick = useCallback(
        (pageId: string) => {
            onSelect(pageId);
        },
        [onSelect]
    );

    return (
        <div className="py-2">
            <div className="px-4 py-1 text-xs font-medium text-app-fg-light">{title}</div>
            {results.map((result, index) => {
                const globalIndex = startIndex + index;
                const isSelected = globalIndex === selectedIndex;

                return (
                    <SearchResultItem
                        key={result.page_id}
                        result={result}
                        globalIndex={globalIndex}
                        isSelected={isSelected}
                        onSelect={handleClick}
                    />
                );
            })}
        </div>
    );
}

// 搜索结果项（使用 React.memo 优化渲染性能）
interface SearchResultItemProps {
    result: SearchResult;
    globalIndex: number;
    isSelected: boolean;
    onSelect: (pageId: string) => void;
}

const SearchResultItem = React.memo(function SearchResultItem({
    result,
    globalIndex,
    isSelected,
    onSelect,
}: SearchResultItemProps) {
    const handleClick = useCallback(() => {
        onSelect(result.page_id);
    }, [result.page_id, onSelect]);

    // 优先显示 representative_block，其次是 top_blocks
    const previewContent = result.representative_block?.content 
        || result.top_blocks?.[0]?.content;

    return (
        <button
            data-index={globalIndex}
            onClick={handleClick}
            className={`w-full px-4 py-2.5 flex items-start gap-3 transition-colors ${
                isSelected ? 'bg-app-hover' : 'hover:bg-app-hover'
            }`}
        >
            <FileText className="w-4 h-4 text-app-fg-light shrink-0 mt-0.5" />
            <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                    {result.page_icon && (
                        <span className="text-base shrink-0">{result.page_icon}</span>
                    )}
                    <span className="text-sm font-medium text-app-fg-deeper truncate">
                        {result.page_title}
                    </span>
                </div>
                <div className="text-xs text-app-fg-light mt-0.5 truncate">
                    {formatPath(result.page_path)}
                </div>
                {previewContent && (
                    <div className="text-xs text-app-fg-light mt-1 line-clamp-2">
                        {previewContent}
                    </div>
                )}
            </div>
        </button>
    );
});

// 格式化路径（移除 UUID，只保留有意义的部分）
function formatPath(path: string): string {
    const parts = path.split('/').filter(Boolean);
    // 移除 UUID 部分（格式：/user_id/workspace_id/...），只保留有意义的路径
    const meaningfulParts = parts.slice(2);
    return meaningfulParts.length > 0 ? meaningfulParts.join(' / ') : '根目录';
}
