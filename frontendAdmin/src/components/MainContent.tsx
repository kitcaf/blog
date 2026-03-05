
import type { 
  BlockData, 
  InlineContent, 
  HeadingBlock, 
  ParagraphBlock, 
  CalloutBlock, 
  ImageBlock, 
  CodeBlock,
  BulletListItemBlock
} from '@blog/types';
import { initialMockData } from '../mockData';

// --- Inline Renderer ---
function InlineText({ content }: { content: InlineContent[] }) {
  if (!content || content.length === 0) return null;

  return (
    <>
      {content.map((node, index) => {
        if (node.type === 'text') {
          const { text, styles } = node;
          let className = '';
          
          if (styles?.bold) className += 'font-bold ';
          if (styles?.italic) className += 'italic ';
          if (styles?.underline) className += 'underline ';
          if (styles?.strikethrough) className += 'line-through ';
          if (styles?.textColor) className += `${styles.textColor} `;
          
          if (styles?.code) {
            return (
              <code key={index} className={`px-1.5 py-0.5 rounded-md bg-app-hover text-sm font-mono ${className}`}>
                {text}
              </code>
            );
          }
          
          return <span key={index} className={className || undefined}>{text}</span>;
        }
        
        if (node.type === 'link') {
          const { text, href } = node;
          return (
            <a key={index} href={href} className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">
              {text}
            </a>
          );
        }
        
        return null;
      })}
    </>
  );
}

// --- Block Renderers ---
function HeadingRenderer({ block }: { block: HeadingBlock }) {
  const { level, textColor, textAlignment } = block.props;
  const alignmentClass = textAlignment ? `text-${textAlignment}` : '';
  const colorClass = textColor || 'text-app-fg-deeper';
  
  const innerContent = <InlineText content={block.content} />;

  switch (level) {
    case 1:
      return <h1 className={`text-4xl font-bold mt-8 mb-4 ${colorClass} ${alignmentClass}`}>{innerContent}</h1>;
    case 2:
      return <h2 className={`text-2xl font-semibold mt-6 mb-3 ${colorClass} ${alignmentClass}`}>{innerContent}</h2>;
    case 3:
      return <h3 className={`text-xl font-medium mt-4 mb-2 ${colorClass} ${alignmentClass}`}>{innerContent}</h3>;
    default:
      return <h1 className={`text-3xl font-bold mt-8 mb-4 ${colorClass} ${alignmentClass}`}>{innerContent}</h1>;
  }
}

function ParagraphRenderer({ block }: { block: ParagraphBlock }) {
  const { textColor, textAlignment } = block.props;
  const alignmentClass = textAlignment ? `text-${textAlignment}` : '';
  const colorClass = textColor || 'text-app-fg';
  
  return (
    <p className={`my-2 leading-relaxed ${colorClass} ${alignmentClass} min-h-[1.5em]`}>
      <InlineText content={block.content} />
    </p>
  );
}

function BulletListRenderer({ block }: { block: BulletListItemBlock }) {
  return (
    <div className="flex gap-2 my-1 items-start text-app-fg">
      <div className="mt-2.5 w-1.5 h-1.5 rounded-full bg-app-fg-light shrink-0" />
      <div className="leading-relaxed">
        <InlineText content={block.content} />
      </div>
    </div>
  );
}

function CalloutRenderer({ block }: { block: CalloutBlock }) {
  const { variant } = block.props;
  
  let bgClass = 'bg-app-hover';
  let icon = '💡';
  
  // 根据 variant 决定样式和图标
  if (variant === 'warning') { icon = '⚠️'; bgClass = 'bg-yellow-900/20 text-yellow-200'; }
  else if (variant === 'error') { icon = '🚨'; bgClass = 'bg-red-900/20 text-red-200'; }
  else if (variant === 'success') { icon = '✅'; bgClass = 'bg-green-900/20 text-green-200'; }
  
  return (
    <div className={`p-4 my-4 rounded-xl flex gap-3 border border-border ${bgClass} text-app-fg`}>
      <div className="shrink-0">{icon}</div>
      <div className="leading-relaxed"><InlineText content={block.content} /></div>
    </div>
  );
}

function CodeBlockRenderer({ block }: { block: CodeBlock }) {
  const codeText = block.content[0]?.text || '';
  return (
    <div className="my-4 rounded-xl overflow-hidden border border-border bg-[#1E1E1E]">
      <div className="px-4 py-2 bg-black/40 text-xs text-app-fg-light border-b border-border flex justify-between items-center">
        <span>{block.props.language}</span>
        <button className="hover:text-app-fg transition-colors">Copy</button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm text-app-fg font-mono leading-relaxed">
        <code>{codeText}</code>
      </pre>
    </div>
  );
}

function ImageRenderer({ block }: { block: ImageBlock }) {
  const { url, caption, alignment } = block.props;
  
  let layoutClass = 'flex justify-center';
  if (alignment === 'left') layoutClass = 'flex justify-start';
  if (alignment === 'right') layoutClass = 'flex justify-end';

  return (
    <div className={`my-6 flex flex-col items-center ${layoutClass}`}>
      <img src={url} alt={caption || 'Block image'} className="rounded-xl max-w-full outline outline-1 outline-border/50" />
      {caption && (
        <div className="mt-2 text-sm text-app-fg-light text-center">{caption}</div>
      )}
    </div>
  );
}

// --- Main Engine ---
export function BlockRenderer({ block }: { block: BlockData }) {
  switch (block.type) {
    case 'heading':
      return <HeadingRenderer block={block as HeadingBlock} />;
    case 'paragraph':
      return <ParagraphRenderer block={block as ParagraphBlock} />;
    case 'bulletListItem':
      return <BulletListRenderer block={block as BulletListItemBlock} />;
    case 'callout':
      return <CalloutRenderer block={block as CalloutBlock} />;
    case 'code':
      return <CodeBlockRenderer block={block as CodeBlock} />;
    case 'image':
      return <ImageRenderer block={block as ImageBlock} />;
    default:
      // Fallback for unsupported blocks
      return (
        <div className="p-2 my-2 border border-dashed border-red-500/50 text-red-400 text-sm rounded-lg bg-red-500/10">
          Unsupported block type: {block.type}
        </div>
      );
  }
}

export function MainContent({ blocks = initialMockData }: { blocks?: BlockData[] }) {
  return (
    <main className="flex-1 h-full bg-app-bg overflow-y-auto relative">
      <div className="max-w-[700px] mx-auto px-8 py-16 md:py-24">
        <div className="flex flex-col gap-1 pb-32">
          {blocks.map((block) => (
            <BlockRenderer key={block.id} block={block} />
          ))}
        </div>
      </div>
    </main>
  );
}
