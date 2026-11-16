import type { MlExplanation, TreeNode } from "@/lib/types";

export type DecisionStep = NonNullable<MlExplanation["decision_path"]>[number];

/**
 * Follow a string's decision path through the (depth-limited) tree the API sends.
 * `ids` are the nodes reached, root first; `matched` is how many path steps were found in the payload
 * (the payload stops at depth 5 while the real tree can be much deeper).
 */
export function followPath(tree: TreeNode, path: DecisionStep[]): { ids: number[]; matched: number } {
  const ids = [tree.id];
  let node: TreeNode | undefined = tree;
  let matched = 0;
  for (const step of path) {
    if (!node || node.leaf || node.feature !== step.feature) break;
    matched += 1;
    const next: TreeNode | undefined = step.goes === "<=" ? node.left : node.right;
    if (!next) break;
    ids.push(next.id);
    node = next;
  }
  return { ids, matched };
}

/** Every node of the payload with its depth. */
export function walkTree(tree: TreeNode, visit: (node: TreeNode, depth: number, parent: TreeNode | null) => void): void {
  const stack: [TreeNode, number, TreeNode | null][] = [[tree, 0, null]];
  while (stack.length) {
    const [node, depth, parent] = stack.pop()!;
    visit(node, depth, parent);
    if (node.right) stack.push([node.right, depth + 1, node]);
    if (node.left) stack.push([node.left, depth + 1, node]);
  }
}

export const hasChildren = (n: TreeNode): boolean => !!(n.left || n.right);
