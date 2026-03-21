import type { BlockData } from "@blog/types";

export function splitPageDocumentBlocks(blocks: BlockData[], pageId?: string) {
    const [pageBlock, ...contentBlocks] = blocks;

    if (!pageBlock || pageBlock.type !== 'page') {
        return {
            pageBlock: null,
            contentBlocks: blocks,
        };
    }

    if (pageId && pageBlock.id !== pageId) {
        return {
            pageBlock: null,
            contentBlocks: blocks,
        };
    }

    return {
        pageBlock,
        contentBlocks,
    };
}