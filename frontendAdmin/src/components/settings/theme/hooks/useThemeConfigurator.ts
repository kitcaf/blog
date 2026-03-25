import { useState } from 'react';

import { useEditorConfig } from '@/components/editor/hooks/useEditorConfig';
import {
  useEditorPreferenceStore,
  type EditorTypographyPatch,
  type EditorTypographyTarget,
} from '@/store/useEditorPreferenceStore';
import { getTypographyConfig, getTypographyMetrics } from '../utils/typographyTheme';

export function useThemeConfigurator() {
  const [activeTarget, setActiveTarget] = useState<EditorTypographyTarget>('h1');
  const { editorPreference, resetEditorPreference } = useEditorConfig();
  const updateTypographyTarget = useEditorPreferenceStore((state) => state.updateTypographyTarget);

  const currentConfig = getTypographyConfig(activeTarget, editorPreference.theme);
  const currentMetrics = getTypographyMetrics(activeTarget, currentConfig);

  function handleTargetChange(target: EditorTypographyTarget) {
    setActiveTarget(target);
  }

  function handleTypographyPatch(patch: EditorTypographyPatch) {
    updateTypographyTarget(activeTarget, patch);
  }

  return {
    activeTarget,
    currentMetrics,
    editorTheme: editorPreference.theme,
    handleTargetChange,
    handleTypographyPatch,
    resetEditorPreference,
  };
}
