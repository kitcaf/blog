/**
 * @file MainContent.tsx
 * @description Block 渲染引擎。
 *
 * 职责：
 *  - 从 Zustand Store 读取当前活跃页面的 Block 列表
 *  - 通过 BlockRenderer（switch 映射）将 Block 类型分发给各原子组件
 *  - 无编辑交互（交互在阶段五 Tiptap 中引入）
 *
 * 性能：
 *  - 使用 selectActivePageContent selector 做细粒度订阅
 *  - 只有活跃页内容变化时才 re-render
 */
import type {
  BlockData,
  InlineContent,
  HeadingBlock,
  ParagraphBlock,
  CalloutBlock,
  ImageBlock,
  CodeBlock,
  BulletListItemBlock,
} from '@blog/types';
import { useBlockStore } from '@/store/useBlockStore';
import { selectActivePageContent } from '@/store/selectors';

// ─────────────────────────────────────────────
// 内联文本渲染器
// ─────────────────────────────────────────────

function InlineText({ content }: { content: InlineContent[] }) {
  if (content.length === 0) return null;

  return (
    <>
      {content.map((node, index) => {
        if (node.type === 'text') {
          const { text, styles } = node;
          let cls = '';
          if (styles?.bold)          cls += 'font-bold ';
          if (styles?.italic)        cls += 'italic ';
          if (styles?.underline)     cls += 'underline ';
          if (styles?.strikethrough) cls += 'line-through ';
          if (styles?.textColor)     cls += `${styles.textColor} `;

          if (styles?.code) {
            return (
              <code key={index} className={`px-1.5 py-0.5 rounded-md bg-app-hover text-sm font-mono ${cls}`}>
                {text}
              </code>
            );
          }

          return cls
            ? <span key={index} className={cls}>{text}</span>
            : <span key={index}>{text}</span>;
        }

        if (node.type === 'link') {
          return (
            <a
              key={index}
              href={node.href}
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
            >
              {node.text}
            </a>
          );
        }

        return null;
      })}
    </>
  );
}

// ─────────────────────────────────────────────
// 原子 Block 渲染器
// ─────────────────────────────────────────────

function HeadingRenderer({ block }: { block: HeadingBlock }) {
  const { level, textAlignment } = block.props;
  const align = textAlignment ? `text-${textAlignment}` : '';
  const inner = <InlineText content={block.content} />;

  const sharedCls = 'font-bold text-app-fg-deeper';
  switch (level) {
    case 1: return <h1 className={`text-4xl mt-8 mb-4 ${sharedCls} ${align}`}>{inner}</h1>;
    case 2: return <h2 className={`text-2xl font-semibold mt-6 mb-3 text-app-fg-deeper ${align}`}>{inner}</h2>;
    case 3: return <h3 className={`text-xl font-medium mt-4 mb-2 text-app-fg-deep ${align}`}>{inner}</h3>;
    default: return <h1 className={`text-3xl mt-8 mb-4 ${sharedCls} ${align}`}>{inner}</h1>;
  }
}

function ParagraphRenderer({ block }: { block: ParagraphBlock }) {
  const align = block.props.textAlignment ? `text-${block.props.textAlignment}` : '';
  return (
    <p className={`my-2 leading-relaxed text-app-fg ${align} min-h-[1.5em]`}>
      <InlineText content={block.content} />
    </p>
  );
}

function BulletListRenderer({ block }: { block: BulletListItemBlock }) {
  return (
    <div className="flex gap-2.5 my-1 items-start text-app-fg">
      <div className="mt-[0.6em] w-1.5 h-1.5 rounded-full bg-app-fg-light shrink-0" />
      <div className="leading-relaxed">
        <InlineText content={block.content} />
      </div>
    </div>
  );
}

function CalloutRenderer({ block }: { block: CalloutBlock }) {
  const { variant } = block.props;

  const variantMap = {
    info:    { icon: '💡', cls: 'bg-app-hover border-border text-app-fg' },
    warning: { icon: '⚠️', cls: 'bg-yellow-900/20 border-yellow-800/50 text-yellow-200' },
    error:   { icon: '🚨', cls: 'bg-red-900/20 border-red-800/50 text-red-200' },
    success: { icon: '✅', cls: 'bg-green-900/20 border-green-800/50 text-green-200' },
  } as const;

  const { icon, cls } = variantMap[variant] ?? variantMap.info;

  return (
    <div className={`p-4 my-4 rounded-xl flex gap-3 border ${cls}`}>
      <div className="shrink-0 select-none">{icon}</div>
      <div className="leading-relaxed">
        <InlineText content={block.content} />
      </div>
    </div>
  );
}

function CodeBlockRenderer({ block }: { block: CodeBlock }) {
  const code = block.content[0]?.text ?? '';
  return (
    <div className="my-4 rounded-xl overflow-hidden border border-border bg-[#1E1E1E]">
      <div className="px-4 py-2 bg-black/40 text-xs text-app-fg-light border-b border-border flex justify-between items-center">
        <span className="font-mono">{block.props.language}</span>
        <button
          type="button"
          className="hover:text-app-fg transition-colors"
          onClick={() => navigator.clipboard.writeText(code)}
        >
          Copy
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm text-app-fg font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ImageRenderer({ block }: { block: ImageBlock }) {
  const { url, caption, alignment } = block.props;
  const justify = alignment === 'left' ? 'justify-start' : alignment === 'right' ? 'justify-end' : 'justify-center';

  return (
    <div className={`my-6 flex flex-col ${justify}`}>
      <img
        src={url}
        alt={caption ?? 'Block image'}
        className="rounded-xl max-w-full outline outline-1 outline-border/50"
        loading="lazy"
      />
      {caption && (
        <p className="mt-2 text-sm text-app-fg-light text-center">{caption}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 主渲染引擎（Switch 映射策略）
// ─────────────────────────────────────────────

function BlockRenderer({ block }: { block: BlockData }) {
  switch (block.type) {
    case 'heading':        return <HeadingRenderer block={block as HeadingBlock} />;
    case 'paragraph':      return <ParagraphRenderer block={block as ParagraphBlock} />;
    case 'bulletListItem': return <BulletListRenderer block={block as BulletListItemBlock} />;
    case 'callout':        return <CalloutRenderer block={block as CalloutBlock} />;
    case 'code':           return <CodeBlockRenderer block={block as CodeBlock} />;
    case 'image':          return <ImageRenderer block={block as ImageBlock} />;
    default:
      return (
        <div className="p-2 my-2 border border-dashed border-red-500/50 text-red-400 text-sm rounded-lg bg-red-500/10">
          Unsupported block type: <code>{block.type}</code>
        </div>
      );
  }
}

// ─────────────────────────────────────────────
// 主内容区容器（订阅 Store）
// ─────────────────────────────────────────────

export function MainContent() {
  // 细粒度订阅：只有活跃页内容变化才触发 re-render
  const blocks = useBlockStore(selectActivePageContent);

  return (
    <main className="flex-1 h-full bg-app-bg overflow-y-auto relative">
      <div className="max-w-[700px] mx-auto px-8 py-16 md:py-24">
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-app-fg-light select-none">
            <div className="text-4xl opacity-30">📄</div>
            <p className="text-sm">选择一个页面，或点击"新建"开始创作</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 pb-32">
            {blocks.map((block) => (
              <BlockRenderer key={block.id} block={block} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
