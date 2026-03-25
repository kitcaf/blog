import { useThemeConfigurator } from '../hooks/useThemeConfigurator';
import { StylePreview } from './StylePreview';
import { TypographyControls } from './TypographyControls';
import { TypographyTargetGrid } from './TypographyTargetGrid';

export function ThemeConfigurator() {
  const {
    activeTarget,
    currentMetrics,
    editorTheme,
    handleTargetChange,
    handleTypographyPatch,
    resetEditorPreference,
  } = useThemeConfigurator();

  return (
    <div className="flex h-full flex-col gap-5 overflow-hidden">
      <div className="grid min-h-0 gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5 overflow-y-auto pr-1">
          <TypographyTargetGrid
            activeTarget={activeTarget}
            onReset={resetEditorPreference}
            onTargetChange={handleTargetChange}
            theme={editorTheme}
          />

          <TypographyControls
            activeTarget={activeTarget}
            metrics={currentMetrics}
            onPatch={handleTypographyPatch}
          />
        </div>

        <div className="min-w-0 overflow-y-auto">
          <StylePreview theme={editorTheme} />
        </div>
      </div>
    </div>
  );
}
