import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  EditorHeadingThemeConfig,
  EditorParagraphThemeConfig,
  EditorPreference,
} from '@blog/types';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export type EditorTypographyTarget = 'paragraph' | 'h1' | 'h2' | 'h3';

export type EditorTypographyPatch = Partial<
  Pick<
    EditorParagraphThemeConfig,
    'fontSize' | 'fontWeight' | 'lineHeight' | 'color' | 'marginTop' | 'marginBottom'
  >
>;

type HeadingPreferenceMap = NonNullable<DeepPartial<EditorPreference>['theme']>['headings'];

interface EditorPreferenceStoreState {
  localPreference: DeepPartial<EditorPreference>;
  runtimeOverrides: DeepPartial<EditorPreference> | null;
  updateTypographyTarget: (
    target: EditorTypographyTarget,
    patch: EditorTypographyPatch,
  ) => void;
  setRuntimeOverrides: (overrides: DeepPartial<EditorPreference> | null) => void;
  clearRuntimeOverrides: () => void;
  resetLocalPreference: () => void;
}

export function mergeDeep<T>(base: T, ...overrides: Array<DeepPartial<T> | null | undefined>): T {
  return overrides.reduce<T>((current, override) => mergeTwo(current, override), base);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeTwo<T>(base: T, override: DeepPartial<T> | null | undefined): T {
  if (!override) {
    return base;
  }

  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override as T;
  }

  const merged: Record<string, unknown> = { ...base };

  for (const key of Object.keys(override)) {
    const baseValue = merged[key];
    const overrideValue = override[key as keyof typeof override];

    if (overrideValue === undefined) {
      continue;
    }

    if (Array.isArray(overrideValue)) {
      merged[key] = [...overrideValue];
      continue;
    }

    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      merged[key] = mergeTwo(baseValue, overrideValue);
      continue;
    }

    merged[key] = overrideValue;
  }

  return merged as T;
}

export const useEditorPreferenceStore = create<EditorPreferenceStoreState>()(
  persist(
    (set) => ({
      localPreference: {},
      runtimeOverrides: null,

      updateTypographyTarget: (target, patch) => {
        set((state) => {
          const currentTheme = state.localPreference.theme ?? {};

          if (target === 'paragraph') {
            const nextParagraph = mergeDeep<DeepPartial<EditorParagraphThemeConfig>>(
              currentTheme.paragraph ?? {},
              patch,
            );

            return {
              localPreference: {
                ...state.localPreference,
                theme: {
                  ...currentTheme,
                  paragraph: nextParagraph,
                },
              },
            };
          }

          const currentHeadings: HeadingPreferenceMap = currentTheme.headings ?? {};
          const nextHeading = mergeDeep<DeepPartial<EditorHeadingThemeConfig>>(
            currentHeadings[target] ?? {},
            patch,
          );

          return {
            localPreference: {
              ...state.localPreference,
              theme: {
                ...currentTheme,
                headings: {
                  ...currentHeadings,
                  [target]: nextHeading,
                },
              },
            },
          };
        });
      },

      setRuntimeOverrides: (overrides) => {
        set({ runtimeOverrides: overrides });
      },

      clearRuntimeOverrides: () => {
        set({ runtimeOverrides: null });
      },

      resetLocalPreference: () => {
        set({ localPreference: {} });
      },
    }),
    {
      name: 'editor-preference-storage',
      partialize: (state) => ({
        localPreference: state.localPreference,
      }),
    },
  ),
);

export type EditorPreferenceOverride = DeepPartial<EditorPreference>;
