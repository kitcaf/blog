import { buildEditorThemeStyle, getEditorThemeRootClassNames } from '../config/editorTheme';
import { useEditorConfig } from './useEditorConfig';

interface UseEditorThemeResult {
  editorCssVars: ReturnType<typeof buildEditorThemeStyle>;
  editorThemeClassName: string;
}

export function useEditorTheme(): UseEditorThemeResult {
  const { editorPreference } = useEditorConfig();

  return {
    editorCssVars: buildEditorThemeStyle(editorPreference.theme),
    editorThemeClassName: getEditorThemeRootClassNames(editorPreference.theme).join(' '),
  };
}
