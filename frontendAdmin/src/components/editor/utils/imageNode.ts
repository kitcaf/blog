import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

interface ImageNodeMatch {
  node: ProseMirrorNode;
  pos: number;
}

interface TemporaryImageAttrs {
  src: string;
  alt?: string;
  title?: string;
  alignment?: 'left' | 'center' | 'right' | 'full';
  width?: number;
  uploadId: string;
  uploadState: 'uploading';
}

interface FinalizedImageAttrs {
  blockId: string;
  src: string;
  alt?: string;
  title?: string;
  alignment?: 'left' | 'center' | 'right' | 'full';
  width?: number;
  uploadId: null;
  uploadState: null;
}

function findImageNodeByUploadId(doc: ProseMirrorNode, uploadId: string): ImageNodeMatch | null {
  let match: ImageNodeMatch | null = null;

  doc.descendants((node, pos) => {
    if (node.type.name !== 'image') {
      return true;
    }

    if (node.attrs.uploadId !== uploadId) {
      return true;
    }

    match = { node, pos };
    return false;
  });

  return match;
}

export function insertTemporaryImageNode(editor: Editor, attrs: TemporaryImageAttrs): boolean {
  return editor
    .chain()
    .focus()
    .insertContent({
      type: 'image',
      attrs,
    })
    .run();
}

export function finalizeTemporaryImageNode(editor: Editor, uploadId: string, attrs: FinalizedImageAttrs): boolean {
  return editor.commands.command(({ tr, dispatch }) => {
    const match = findImageNodeByUploadId(tr.doc, uploadId);
    if (!match) {
      return false;
    }

    tr.setNodeMarkup(match.pos, undefined, {
      ...match.node.attrs,
      ...attrs,
    });

    dispatch?.(tr);
    return true;
  });
}

export function removeTemporaryImageNode(editor: Editor, uploadId: string): boolean {
  return editor.commands.command(({ tr, dispatch }) => {
    const match = findImageNodeByUploadId(tr.doc, uploadId);
    if (!match) {
      return false;
    }

    tr.delete(match.pos, match.pos + match.node.nodeSize);
    dispatch?.(tr);
    return true;
  });
}
