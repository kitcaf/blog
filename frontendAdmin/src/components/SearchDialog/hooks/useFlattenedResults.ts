/**
 * @file useFlattenedResults.ts
 * @description 扁平化搜索结果 Hook（用于虚拟滚动）
 */

import { useMemo } from 'react';
import type { SearchResult } from '@/api/search';

export interface FlattenedItem {
    type: 'header' | 'result';
    title?: string;
    result?: SearchResult;
}

export function useFlattenedResults(results: SearchResult[]): FlattenedItem[] {
    return useMemo(() => {
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

        const flattened: FlattenedItem[] = [];

        if (groups.today.length > 0) {
            flattened.push({ type: 'header', title: '今天' });
            groups.today.forEach(result => flattened.push({ type: 'result', result }));
        }

        if (groups.lastWeek.length > 0) {
            flattened.push({ type: 'header', title: '上周' });
            groups.lastWeek.forEach(result => flattened.push({ type: 'result', result }));
        }

        if (groups.last30Days.length > 0) {
            flattened.push({ type: 'header', title: '过去 30 天' });
            groups.last30Days.forEach(result => flattened.push({ type: 'result', result }));
        }

        if (groups.older.length > 0) {
            flattened.push({ type: 'header', title: '更早' });
            groups.older.forEach(result => flattened.push({ type: 'result', result }));
        }

        return flattened;
    }, [results]);
}
