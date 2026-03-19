/**
 * @file useGlobalShortcut.ts
 * @description 全局快捷键 Hook
 */

import { useEffect } from 'react';

export function useGlobalShortcut(
  key: string,
  callback: () => void,
  options: {
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    alt?: boolean;
  } = {}
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { ctrl = false, meta = false, shift = false, alt = false } = options;

      const isCtrlMatch = ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
      const isShiftMatch = shift ? e.shiftKey : !e.shiftKey;
      const isAltMatch = alt ? e.altKey : !e.altKey;

      if (
        e.key.toLowerCase() === key.toLowerCase() &&
        (ctrl || meta ? e.ctrlKey || e.metaKey : isCtrlMatch) &&
        isShiftMatch &&
        isAltMatch
      ) {
        e.preventDefault();
        callback();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [key, callback, options]);
}
