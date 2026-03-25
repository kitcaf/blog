import type { EditorThemeConfig } from '@blog/types';

import { cn } from '@/lib/utils';
import { buildEditorThemeStyle, getEditorThemeRootClassNames } from '@/components/editor/config/editorTheme';

interface StylePreviewProps {
  theme: EditorThemeConfig;
  className?: string;
}

export function StylePreview({ theme, className }: StylePreviewProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[26px] border border-border/80 bg-app-bg/85 shadow-[0_18px_48px_rgba(0,0,0,0.08)]',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/70 bg-app-fg-lightest/40 px-5 py-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-app-fg-light">Preview</div>
          <h3 className="mt-1 text-sm font-semibold text-app-fg-deeper">文章画布</h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-app-fg-light" />
          <span className="h-2.5 w-2.5 rounded-full bg-app-fg-deep" />
          <span className="h-2.5 w-2.5 rounded-full bg-app-fg-deeper" />
        </div>
      </div>

      <div
        className={cn(
          'bg-[radial-gradient(circle_at_top,rgba(24,24,27,0.04),transparent_52%)] px-5 py-5',
          ...getEditorThemeRootClassNames(theme),
        )}
        style={buildEditorThemeStyle(theme)}
      >
        <div className="rounded-[24px] border border-border/70 bg-app-bg px-7 py-7 shadow-[0_20px_50px_rgba(0,0,0,0.05)]">
          <div className="prosemirror-editor space-y-0">
            <h1>封面标题</h1>
            <p>正文会跟着你的设置一起变化，重点看层级、留白和阅读节奏。</p>
            <h2>章节标题</h2>
            <p>这里适合观察标题与正文之间的过渡是否舒服。</p>
            <h3>小节标题</h3>
            <p>如果整体偏轻，可以把标题做得更有辨识度一点。</p>
            <h4>四级标题</h4>
            <p>适合放在内容密度更高的小节里，保持层级清晰但不要过重。</p>
            <h5>五级标题</h5>
            <p>更像文内标签，适合轻量提示和次级说明。</p>
            <h6>六级标题</h6>
            <p>通常用在补充信息，不建议和正文做出过强反差。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
