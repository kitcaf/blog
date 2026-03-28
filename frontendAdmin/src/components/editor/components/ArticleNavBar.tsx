import { lazy, memo, Suspense, useCallback, useState } from 'react';
import { Globe, MoreHorizontal, Send } from 'lucide-react';
import type { BlockData, PageBlock } from '@blog/types';
import { usePageDetailQuery } from '@/hooks/useBlocksQuery';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { SidebarToggle } from './SidebarToggle';

const PublishDialog = lazy(async () => {
  const module = await import('@/components/publish/PublishDialog');
  return { default: module.PublishDialog };
});

interface ArticleNavBarProps {
  currentPageId?: string;
}

interface PublishDialogMeta {
  description?: string;
  tags?: string[];
  categoryId?: string;
  slug?: string;
  publishedAt?: string;
}

function isPageBlock(block: BlockData | null): block is PageBlock {
  return Boolean(block && block.type === 'page');
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readOptionalTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.every((item) => typeof item === 'string') ? value : undefined;
}

function buildPublishDialogMeta(page: PageBlock): PublishDialogMeta {
  const pageWithUnknownFields = page as PageBlock & {
    categoryId?: unknown;
    category_id?: unknown;
  };

  return {
    description: readOptionalString(page.props.description),
    tags: readOptionalTags(page.props.tags),
    categoryId: readOptionalString(
      pageWithUnknownFields.categoryId ?? pageWithUnknownFields.category_id,
    ),
    slug: page.slug ?? undefined,
    publishedAt: page.publishedAt ?? undefined,
  };
}

export const ArticleNavBar = memo(function ArticleNavBar({ currentPageId }: ArticleNavBarProps) {
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const { page } = usePageDetailQuery(currentPageId ?? null);

  const currentPage = isPageBlock(page) ? page : null;
  const canOpenPublishDialog = Boolean(currentPageId && currentPage);
  const isPublished = Boolean(currentPage?.publishedAt);
  const pageTitle = currentPage?.props.title ?? '无标题';
  const currentMeta = currentPage ? buildPublishDialogMeta(currentPage) : undefined;

  const handleOpenPublishDialog = useCallback(() => {
    if (!canOpenPublishDialog) {
      return;
    }

    setIsPublishDialogOpen(true);
  }, [canOpenPublishDialog]);

  const handleClosePublishDialog = useCallback(() => {
    setIsPublishDialogOpen(false);
  }, []);

  return (
    <>
      <div className="sticky top-0 z-40 w-full border-b border-app-fg-lighter bg-app-bg/80 backdrop-blur-sm">
        <div className="flex h-12 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <SidebarToggle />
            <SyncStatusIndicator />
          </div>

          <div className="flex items-center gap-2">
            {canOpenPublishDialog ? (
              <button
                type="button"
                onClick={handleOpenPublishDialog}
                className={[
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isPublished
                    ? 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30',
                ].join(' ')}
                title={isPublished ? '已发布，点击管理' : '发布文章'}
              >
                {isPublished ? <Globe className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                <span>{isPublished ? '已发布' : '发布'}</span>
              </button>
            ) : null}

            <button
              type="button"
              className="rounded-md p-1.5 text-app-fg-light transition-colors hover:bg-app-hover hover:text-app-fg-deeper"
              title="更多操作"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {isPublishDialogOpen && currentPageId && currentPage ? (
        <Suspense fallback={null}>
          <PublishDialog
            isOpen={isPublishDialogOpen}
            onClose={handleClosePublishDialog}
            pageId={currentPageId}
            pageTitle={pageTitle}
            isPublished={isPublished}
            currentMeta={currentMeta}
          />
        </Suspense>
      ) : null}
    </>
  );
});
