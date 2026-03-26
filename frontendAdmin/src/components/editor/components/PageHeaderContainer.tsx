import { memo, useCallback, useState } from 'react';
import type { BlockSyncSession } from '@/store/useBlockStore';
import { usePageTitleSyncController } from '../sync/usePageTitleSyncController';
import { PageHeader } from './PageHeader';

interface PageHeaderContainerProps {
  pageId?: string;
  initialTitle: string;
  isPageLoaded: boolean;
  session: BlockSyncSession;
  onEnter: () => void;
  scheduleSync: () => void;
  flushSync: () => void;
}

export const PageHeaderContainer = memo(function PageHeaderContainer({
  pageId,
  initialTitle,
  isPageLoaded,
  session,
  onEnter,
  scheduleSync,
  flushSync,
}: PageHeaderContainerProps) {
  const [title, setTitle] = useState(initialTitle);

  const { scheduleTitleSync, flushTitleSync } = usePageTitleSyncController({
    pageId,
    session,
    scheduleSync,
    flushSync,
  });

  const handleTitleChange = useCallback(
    (nextTitle: string) => {
      setTitle(nextTitle);
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
