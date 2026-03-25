import { useCallback, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { toast } from 'sonner';

import {
  finalizeTemporaryImageNode,
  insertTemporaryImageNode,
  removeTemporaryImageNode,
} from '../utils/imageNode';
import {
  createImagePreviewUrl,
  revokeImagePreviewUrl,
  uploadEditorImage,
  validateImageFile,
} from '../utils/imageUpload';

export function useImageUpload() {
  const previewUrlsRef = useRef(new Map<string, string>());

  const clearPreviewUrl = useCallback((uploadId: string) => {
    const previewUrl = previewUrlsRef.current.get(uploadId);
    if (!previewUrl) {
      return;
    }

    revokeImagePreviewUrl(previewUrl);
    previewUrlsRef.current.delete(uploadId);
  }, []);

  const handleSingleImageUpload = useCallback(
    async (editor: Editor, file: File) => {
      const validationError = validateImageFile(file);
      if (validationError) {
        toast.error(validationError);
        return;
      }

      const uploadId = crypto.randomUUID();
      const previewUrl = createImagePreviewUrl(file);
      previewUrlsRef.current.set(uploadId, previewUrl);

      const didInsert = insertTemporaryImageNode(editor, {
        src: previewUrl,
        alt: file.name,
        title: file.name,
        alignment: 'center',
        width: 100,
        uploadId,
        uploadState: 'uploading',
      });

      if (!didInsert) {
        clearPreviewUrl(uploadId);
        toast.error('图片插入失败');
        return;
      }

      try {
        const result = await uploadEditorImage(file);

        const didFinalize = finalizeTemporaryImageNode(editor, uploadId, {
          blockId: crypto.randomUUID(),
          src: result.url,
          alt: file.name,
          title: file.name,
          alignment: 'center',
          width: 100,
          uploadId: null,
          uploadState: null,
        });

        if (!didFinalize) {
          return;
        }
      } catch (error) {
        removeTemporaryImageNode(editor, uploadId);

        const message = error instanceof Error ? error.message : '图片上传失败';
        toast.error(message);
      } finally {
        clearPreviewUrl(uploadId);
      }
    },
    [clearPreviewUrl],
  );

  const handleImagePaste = useCallback(
    (editor: Editor, files: File[]) => {
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      if (imageFiles.length === 0) {
        return;
      }

      void (async () => {
        for (const file of imageFiles) {
          await handleSingleImageUpload(editor, file);
        }
      })();
    },
    [handleSingleImageUpload],
  );

  useEffect(() => {
    return () => {
      for (const previewUrl of previewUrlsRef.current.values()) {
        revokeImagePreviewUrl(previewUrl);
      }

      previewUrlsRef.current.clear();
    };
  }, []);

  return {
    handleImagePaste,
  };
}
