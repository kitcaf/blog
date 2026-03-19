/**
 * @file useDebounce.ts
 * @description 通用防抖 Hooks
 * 
 * 提供两种防抖模式：
 * 1. useDebounce - 值防抖（用于搜索输入等场景）
 * 2. useDebouncedCallback - 回调防抖（用于编辑器同步等场景）
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 值防抖 Hook
 * 
 * 用于延迟更新值，常用于搜索输入框等场景
 * 
 * @example
 * const [query, setQuery] = useState('');
 * const debouncedQuery = useDebounce(query, 300);
 * 
 * @param value - 需要防抖的值
 * @param delay - 延迟时间（毫秒）
 * @returns 防抖后的值
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * 回调防抖 Hook
 * 
 * 用于延迟执行回调函数，常用于编辑器同步、表单提交等场景
 * 
 * 特点：
 * - 使用 useCallback 优化，避免不必要的重新创建
 * - 自动清理定时器，防止内存泄漏
 * - 支持立即执行模式（leading edge）
 * 
 * @example
 * const debouncedSync = useDebouncedCallback(() => {
 *   syncToServer();
 * }, 1000);
 * 
 * // 在编辑器更新时调用
 * editor.on('update', debouncedSync);
 * 
 * @param callback - 需要防抖的回调函数
 * @param delay - 延迟时间（毫秒）
 * @param leading - 是否在延迟开始时立即执行（默认 false）
 * @returns 防抖后的回调函数
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
  leading = false
): T {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCallTimeRef = useRef<number>(0);

  // 保持 callback 引用最新
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallTimeRef.current;

      lastCallTimeRef.current = now;

      // 立即执行模式（leading edge）
      if (leading && timeSinceLastCall > delay) {
        return callbackRef.current(...args);
      }

      // 清除旧定时器
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // 设置新定时器
      timerRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay, leading]
  ) as T;

  return debouncedCallback;
}
