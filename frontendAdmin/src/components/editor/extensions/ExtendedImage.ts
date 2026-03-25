import Image from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';

type ImageAlignment = 'left' | 'center' | 'right' | 'full';

const DEFAULT_IMAGE_ALIGNMENT: ImageAlignment = 'center';
const DEFAULT_IMAGE_WIDTH = 100;

function normalizeImageAlignment(value: unknown): ImageAlignment {
  if (value === 'left' || value === 'center' || value === 'right' || value === 'full') {
    return value;
  }

  return DEFAULT_IMAGE_ALIGNMENT;
}

function normalizeImageWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_IMAGE_WIDTH;
  }

  return Math.max(20, Math.min(100, Math.round(value)));
}

function buildImageStyle(attributes: Record<string, unknown>): string {
  const alignment = normalizeImageAlignment(attributes['alignment']);
  const width = alignment === 'full' ? 100 : normalizeImageWidth(attributes['width']);

  const declarations = ['display: block', 'height: auto', `width: ${width}%`];

  switch (alignment) {
    case 'left':
      declarations.push('margin-left: 0', 'margin-right: auto');
      break;
    case 'right':
      declarations.push('margin-left: auto', 'margin-right: 0');
      break;
    case 'full':
      declarations.push('margin-left: auto', 'margin-right: auto');
      break;
    case 'center':
    default:
      declarations.push('margin-left: auto', 'margin-right: auto');
      break;
  }

  return declarations.join('; ');
}

export const ExtendedImage = Image.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      inline: false,
      allowBase64: true,
      resize: false,
      HTMLAttributes: {
        class: 'editor-image-node',
        decoding: 'async',
        loading: 'lazy',
      },
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      blockId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-block-id'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes['blockId'] ? { 'data-block-id': attributes['blockId'] } : {},
      },
      alignment: {
        default: DEFAULT_IMAGE_ALIGNMENT,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-alignment'),
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-alignment': normalizeImageAlignment(attributes['alignment']),
        }),
      },
      width: {
        default: DEFAULT_IMAGE_WIDTH,
        parseHTML: (element: HTMLElement) => {
          const rawWidth = Number(element.getAttribute('data-width') ?? DEFAULT_IMAGE_WIDTH);
          return normalizeImageWidth(rawWidth);
        },
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-width': normalizeImageWidth(attributes['width']),
        }),
      },
      uploadId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-upload-id'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes['uploadId'] ? { 'data-upload-id': attributes['uploadId'] } : {},
      },
      uploadState: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-upload-state'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes['uploadState'] ? { 'data-upload-state': attributes['uploadState'] } : {},
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const style = buildImageStyle(HTMLAttributes);

    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        style,
      }),
    ];
  },
});
