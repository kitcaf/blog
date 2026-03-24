import type { EditorPreference } from '@blog/types';

import { defaultEditorPreference } from '../config/defaultConfig';
import {
  mergeDeep,
  useEditorPreferenceStore,
  type EditorPreferenceOverride,
} from '@/store/useEditorPreferenceStore';

interface UseEditorConfigResult {
  editorPreference: EditorPreference;
  updateRuntimeOverrides: (overrides: EditorPreferenceOverride | null) => void;
  resetEditorPreference: () => void;
}

export function useEditorConfig(): UseEditorConfigResult {
  const localPreference = useEditorPreferenceStore((state) => state.localPreference);
  const runtimeOverrides = useEditorPreferenceStore((state) => state.runtimeOverrides);
  const setRuntimeOverrides = useEditorPreferenceStore((state) => state.setRuntimeOverrides);
  const resetLocalPreference = useEditorPreferenceStore((state) => state.resetLocalPreference);

  const editorPreference = mergeDeep(defaultEditorPreference, localPreference, runtimeOverrides);

  return {
    editorPreference,
    updateRuntimeOverrides: setRuntimeOverrides,
    resetEditorPreference: resetLocalPreference,
  };
}
