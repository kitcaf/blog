import { client } from '@/api/client';

const DEFAULT_MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const IMAGE_UPLOAD_ENDPOINT = import.meta.env.VITE_EDITOR_IMAGE_UPLOAD_ENDPOINT?.trim() ?? '';

export const IMAGE_UPLOAD_ALLOWED_MIME_TYPES = [
  'image/apng',
  'image/avif',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
] as const;

export interface EditorImageUploadResult {
  url: string;
}

type UploadResponseShape =
  | string
  | { url?: string }
  | { file?: { url?: string } }
  | { image?: { url?: string } };

function isAllowedImageMimeType(file: File): boolean {
  return IMAGE_UPLOAD_ALLOWED_MIME_TYPES.includes(file.type as (typeof IMAGE_UPLOAD_ALLOWED_MIME_TYPES)[number]);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('读取图片失败'));
    };

    reader.onerror = () => {
      reject(new Error('读取图片失败'));
    };

    reader.readAsDataURL(file);
  });
}

function resolveUploadUrl(payload: UploadResponseShape): string | null {
  if (typeof payload === 'string' && payload.length > 0) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    if ('url' in payload && typeof payload.url === 'string' && payload.url.length > 0) {
      return payload.url;
    }

    if ('file' in payload && typeof payload.file?.url === 'string' && payload.file.url.length > 0) {
      return payload.file.url;
    }

    if ('image' in payload && typeof payload.image?.url === 'string' && payload.image.url.length > 0) {
      return payload.image.url;
    }
  }

  return null;
}

async function uploadImageToEndpoint(file: File): Promise<EditorImageUploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await client.post<UploadResponseShape>(IMAGE_UPLOAD_ENDPOINT, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  const url = resolveUploadUrl(response.data);
  if (!url) {
    throw new Error('上传成功，但未返回图片地址');
  }

  return { url };
}

async function uploadImageWithFallback(file: File): Promise<EditorImageUploadResult> {
  const dataUrl = await readFileAsDataUrl(file);
  return { url: dataUrl };
}

export function createImagePreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function revokeImagePreviewUrl(url: string | null | undefined): void {
  if (!url?.startsWith('blob:')) {
    return;
  }

  URL.revokeObjectURL(url);
}

export function validateImageFile(file: File): string | null {
  if (!isAllowedImageMimeType(file)) {
    return '仅支持 PNG、JPEG、WebP、GIF、AVIF、SVG 等图片格式';
  }

  if (file.size > DEFAULT_MAX_IMAGE_SIZE_BYTES) {
    return '图片不能超过 5MB';
  }

  return null;
}

export async function uploadEditorImage(file: File): Promise<EditorImageUploadResult> {
  if (IMAGE_UPLOAD_ENDPOINT) {
    return uploadImageToEndpoint(file);
  }

  return uploadImageWithFallback(file);
}
