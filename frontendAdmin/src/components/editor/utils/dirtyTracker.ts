import type { Selection, Transaction } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

const CHANGE_RATIO_THRESHOLD = 0.5;
const CHANGE_NUMBER_THRESHOLD = 200;

function clampPosition(doc: ProseMirrorNode, pos: number): number {
  return Math.max(0, Math.min(pos, doc.content.size));
}

function getEnclosingBlockId(doc: ProseMirrorNode, rawPos: number): string | null {
  const pos = clampPosition(doc, rawPos);
  const $pos = doc.resolve(pos);

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    const id = node.attrs?.blockId;
    if (typeof id === 'string' && id.length > 0) {
      return id;
    }
  }

  return null;
}

function collectIdsFromRange(doc: ProseMirrorNode, from: number, to: number, target: Set<string>) {
  doc.nodesBetween(clampPosition(doc, from), clampPosition(doc, to), (node) => {
    const id = node.attrs?.blockId;
    if (typeof id === 'string' && id.length > 0) {
      target.add(id);
    }
    return true;
  });
}

function collectBoundaryCandidateIds(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  target: Set<string>,
) {
  const boundaryPositions = [from, to, from - 1, to + 1];

  for (const pos of boundaryPositions) {
    const id = getEnclosingBlockId(doc, pos);
    if (id) {
      target.add(id);
    }
  }
}

function collectRangeCandidateIds(doc: ProseMirrorNode, from: number, to: number, target: Set<string>) {
  if (from !== to) {
    collectIdsFromRange(doc, from, to, target);
  }

  collectBoundaryCandidateIds(doc, from, to, target);
}

export function collectSelectionCandidateIds(
  doc: ProseMirrorNode,
  selection: Selection,
  target: Set<string>,
) {
  const { from, to, empty } = selection;

  if (!empty) {
    collectIdsFromRange(doc, from, to, target);
  }

  collectBoundaryCandidateIds(doc, from, to, target);
}

export function collectTransactionCandidateIds(tr: Transaction, target: Set<string>): boolean {
  const docSize = tr.doc.content.size;
  if (docSize === 0) {
    return false;
  }

  let totalChangeRange = 0;
  if (tr.steps.length > CHANGE_NUMBER_THRESHOLD) {
    return true;
  }

  for (let stepIndex = 0; stepIndex < tr.steps.length; stepIndex += 1) {
    const step = tr.steps[stepIndex];
    const stepMap = step.getMap();
    const oldDoc = tr.docs[stepIndex] ?? tr.before;
    const newDoc = stepIndex + 1 < tr.docs.length ? tr.docs[stepIndex + 1] : tr.doc;

    stepMap.forEach((oldStart, oldEnd, newStart, newEnd) => {
      totalChangeRange += Math.max(oldEnd - oldStart, newEnd - newStart);

      if (totalChangeRange > docSize * CHANGE_RATIO_THRESHOLD) {
        return true;
      }

      collectRangeCandidateIds(oldDoc, oldStart, oldEnd, target);
      collectRangeCandidateIds(newDoc, newStart, newEnd, target);
    });

    if (totalChangeRange > docSize * CHANGE_RATIO_THRESHOLD) {
      return true;
    }
  }

  return false;
}

export function getOrderedBlockIds(doc: ProseMirrorNode): string[] {
  const orderedIds: string[] = [];

  doc.descendants((node) => {
    const id = node.attrs?.blockId;
    if (typeof id === 'string' && id.length > 0) {
      orderedIds.push(id);
    }
    return true;
  });

  return orderedIds;
}

export function hasStructureChanged(oldDoc: ProseMirrorNode, newDoc: ProseMirrorNode): boolean {
  const oldIds = getOrderedBlockIds(oldDoc);
  const newIds = getOrderedBlockIds(newDoc);

  return oldIds.length !== newIds.length || oldIds.some((id, index) => id !== newIds[index]);
}
