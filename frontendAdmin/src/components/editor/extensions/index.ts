/**
 * @file extensions/index.ts
 * @description 组装编辑器所需的全部 Tiptap 扩展列表。
 *
 * 扩展策略：
 *  - StarterKit：提供绝大多数通用 block/mark（heading, paragraph, bold, italic 等）
 *  - CodeBlockLowlight：替换 StarterKit 的 codeBlock，支持语法高亮
 *  - Underline/Link/TaskList/TaskItem：StarterKit 未包含的常用功能
 *  - BlockIdExtension：全局给所有 block 注入 blockId attr
 *  - CalloutNode / ImageBlockNode：自定义原子块
 *  - Placeholder：空编辑器 / 空 block 占位提示
 */
import StarterKit from '@tiptap/starter-kit';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { createLowlight } from 'lowlight';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import go from 'highlight.js/lib/languages/go';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';

import { BlockIdExtension } from './BlockIdExtension';
import { CalloutNode } from './CalloutNode';
import { ImageBlockNode } from './ImageBlockNode';
import { DirtyTrackerExtension } from './DirtyTrackerExtension';

// 只注册项目常用语言，减少 bundle 体积（按需注册，而非 import all）
const lowlight = createLowlight();
lowlight.register({ typescript, javascript, go, python, sql, bash });

const sharedEditorExtensions = [
  // ── 核心套件（禁用部分扩展，由自定义版本替换）──────────────
  StarterKit.configure({
    codeBlock: false, // 禁用 StarterKit 内置的 codeBlock，由 CodeBlockLowlight 接管
    heading: {
      levels: [1, 2, 3, 4, 5, 6], // 只支持 H1-H3，与 Block 模型一致
    },
  }),

  // ── 代码块（语法高亮）──────────────────────────────────────
  CodeBlockLowlight.configure({
    lowlight,
    defaultLanguage: 'plaintext',
  }),

  // ── 额外 Mark 扩展 ─────────────────────────────────────────
  Underline,
  Link.configure({
    openOnClick: false,  // 编辑模式不自动跳转，避免误操作
    autolink: true,      // 自动识别 URL 文本转链接
    HTMLAttributes: {
      class: 'text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors',
    },
  }),

  // ── CheckList（TaskList + TaskItem）──────────────────────────
  TaskList,
  TaskItem.configure({
    nested: false, // 不支持嵌套 checkList（与 Block 模型一致）
  }),

  // ── blockId 全局注入 ─────────────────────────────────────────
  BlockIdExtension,

  // ── 自定义 Block Node ─────────────────────────────────────────
  CalloutNode,
  ImageBlockNode,

  // ── 占位提示 ─────────────────────────────────────────────────
  Placeholder.configure({
    placeholder: ({ node }) => {
      if (node.type.name === 'heading') return '标题';
      return "输入 '/' 插入块，或开始写作…";
    },
    showOnlyWhenEditable: true,
  }),

  // ── 性能更新拦截引擎 ──────────────────────────────────────────
  DirtyTrackerExtension,
];

/**
 * 创建编辑器扩展列表
 */
export const createEditorExtensions = () => sharedEditorExtensions;

export const editorExtensions = sharedEditorExtensions;
