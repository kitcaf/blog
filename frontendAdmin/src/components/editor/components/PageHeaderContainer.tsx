import { memo, useCallback } from 'react';
import { useBlockStore } from '@/store/useBlockStore';
import { usePageTitleSyncController } from '../sync/usePageTitleSyncController';
import { PageHeader } from './PageHeader';

interface PageHeaderContainerProps {
  pageId?: string;
  fallbackTitle: string;
  isPageLoaded: boolean;
  onEnter: () => void;
  scheduleSync: () => void;
  flushSync: () => void;
}

export const PageHeaderContainer = memo(function PageHeaderContainer({
  pageId,
  fallbackTitle,
  isPageLoaded,
  onEnter,
  scheduleSync,
  flushSync,
}: PageHeaderContainerProps) {
  const storeTitle = useBlockStore((state) => {
    if (!pageId) {
      return undefined;
    }

    const pageBlock = state.blocksById[pageId];
    if (!pageBlock || pageBlock.type !== 'page') {
      return undefined;
    }

    const nextTitle = pageBlock.props.title;
    return typeof nextTitle === 'string' ? nextTitle : undefined;
  });

  const title = storeTitle ?? fallbackTitle;

  const { scheduleTitleSync, flushTitleSync } = usePageTitleSyncController({
    pageId,
    scheduleSync,
    flushSync,
  });

  const handleTitleChange = useCallback(
    (nextTitle: string) => {
      scheduleTitleSync(nextTitle);
    },
    [scheduleTitleSync],
  );

  const handleEnter = useCallback(() => {
    flushTitleSync();
    onEnter();
  }, [flushTitleSync, onEnter]);

  return (
    <PageHeader
      value={title}
      onChange={handleTitleChange}
      onEnter={handleEnter}
      onBlur={flushTitleSync}
      isPageLoaded={isPageLoaded}
    />
  );
});
