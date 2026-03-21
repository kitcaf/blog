/**
 * @file SearchInput.tsx
 * @description 搜索输入框组件
 */

import React, { forwardRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

interface SearchInputProps {
    query: string;
    isLoading: boolean;
    onQueryChange: (query: string) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onClose: () => void;
}

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
    ({ query, isLoading, onQueryChange, onKeyDown, onClose }, ref) => {
        return (
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
                <Search className="w-5 h-5 text-app-fg-light shrink-0" />
                <input
                    ref={ref}
                    type="text"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    onKeyDown={onKeyDown}
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
        );
    }
);

SearchInput.displayName = 'SearchInput';

export default SearchInput;
