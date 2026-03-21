/**
 * @file treeHelpers.ts
 * @description 树结构操作工具函数
 */

import type { PageTreeNode } from '@/api/blocks';

/**
 * 递归更新树节点标题（用于乐观更新）
 * @param nodes 树节点数组
 * @param targetId 目标节点 ID
 * @param newTitle 新标题
 * @returns 更新后的树节点数组
 */
export function updateTreeNodeTitle(
  nodes: PageTreeNode[],
  targetId: string,
  newTitle: string
): PageTreeNode[] {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return { ...node, title: newTitle };
    }
    
    if (node.children && node.children.length > 0) {
      return {
        ...node,
        children: updateTreeNodeTitle(node.children, targetId, newTitle),
      };
    }
    
    return node;
  });
}
