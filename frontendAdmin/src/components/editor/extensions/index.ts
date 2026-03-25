/**
 * @file extensions/index.ts
 * @description 组装编辑器所需的全部 Tiptap 扩展列表。
 *
 * 扩展策略：
 *  - StarterKit：提供绝大多数通用 block/mark（heading, paragraph, bold, italic 等）
 *  - CodeBlockLowlight：替换 StarterKit 的 codeBlock，支持语法高亮
 *  - Underline/Link/TaskList/TaskItem：StarterKit 未包含的常用功能
 *  - BlockIdExtension：全局给常规 block 注入 blockId attr
 *  - CalloutNode：自定义块节点
 *  - ExtendedImage：扩展官方 Image，保持原生 HTML 渲染
 *  - FileHandler：处理图片粘贴
 *  - Placeholder：空编辑器 / 空 block 占位提示
 */
import type { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import FileHandler from '@tiptap/extension-file-handler';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Underline from '@tiptap/extension-underline';
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import go from 'highlight.js/lib/languages/go';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';

import { IMAGE_UPLOAD_ALLOWED_MIME_TYPES } from '../utils/imageUpload';
import { BlockIdExtension } from './BlockIdExtension';
import { CalloutNode } from './CalloutNode';
import { DirtyTrackerExtension } from './DirtyTrackerExtension';
import { ExtendedImage } from './ExtendedImage';

interface EditorExtensionsOptions {
  onImagePaste?: (editor: Editor, files: File[], pasteContent?: string) => void;
}

// 只注册项目常用语言，减少 bundle 体积（按需注册，而非 import all）
const lowlight = createLowlight();
lowlight.register({ typescript, javascript, go, python, sql, bash });

export function createEditorExtensions(options: EditorExtensionsOptions = {}) {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
    }),

    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: 'plaintext',
    }),

    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: {
        class: 'text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors',
      },
    }),

    TaskList,
    TaskItem.configure({
      nested: false,
    }),

    BlockIdExtension,
    CalloutNode,
    ExtendedImage,
    FileHandler.configure({
      allowedMimeTypes: [...IMAGE_UPLOAD_ALLOWED_MIME_TYPES],
      onPaste: (editor, files, pasteContent) => {
        options.onImagePaste?.(editor, files, pasteContent);
      },
    }),

    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') return '标题';
        return "输入 '/' 插入块，或开始写作…";
      },
      showOnlyWhenEditable: true,
    }),

    DirtyTrackerExtension,
  ];
}

export const editorExtensions = createEditorExtensions();
