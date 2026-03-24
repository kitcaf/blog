import type { EditorThemeConfig } from '@blog/types';

import { cn } from '@/lib/utils';
import { buildEditorThemeStyle, getEditorThemeRootClassNames } from '../config/editorTheme';

interface StylePreviewProps {
  theme: EditorThemeConfig;
  className?: string;
}

export function StylePreview({ theme, className }: StylePreviewProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-app-bg/80 shadow-sm overflow-hidden',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-app-fg-lightest/60 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-app-fg-deeper">实时预览</h3>
          <p className="mt-1 text-xs text-app-fg-light">
            这里复用了编辑器的同一套 `--editor-*` 变量映射。
          </p>
        </div>
        <span className="rounded-full border border-border bg-app-bg px-2.5 py-1 text-[11px] font-medium text-app-fg-light">
          Live
        </span>
      </div>

      <div
        className={cn(
          'px-5 py-5',
          ...getEditorThemeRootClassNames(theme),
        )}
        style={buildEditorThemeStyle(theme)}
      >
        <div className="prosemirror-editor space-y-0">
          <h1>一级标题，定义主视觉层级</h1>
          <p>
            正文预览会直接响应字号、颜色、字重和间距修改，方便你一边调整一边确认排版节奏。
          </p>
          <h2>二级标题，用于章节分组</h2>
          <p>
            这段文字模拟文章正文，观察标题与段落之间的呼吸感是否舒适。
          </p>
          <h3>三级标题，适合细分小节</h3>
          <p>
            如果你想做更强烈的风格区分，可以把正文保持克制，把标题做得更有性格。
          </p>
        </div>
      </div>
    </div>
  );
}
