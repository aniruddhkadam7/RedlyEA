export function computeImpactPaths({
  nodes,
  edges,
  rootId,
  maxDepth,
  direction,
}: {
  nodes: ReadonlyArray<{ id: string }>;
  edges: ReadonlyArray<{ from: string; to: string }>;
  rootId: string;
  maxDepth: number;
  direction: 'downstream';
}): string[][] {
  if (direction !== 'downstream') return [];
  if (!rootId || maxDepth <= 0) return [];

  const nodeIdSet = new Set(nodes.map((n) => n.id));
  if (!nodeIdSet.has(rootId)) return [];

  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    if (!nodeIdSet.has(e.from) || !nodeIdSet.has(e.to)) continue;
    const list = adjacency.get(e.from);
    if (list) list.push(e.to);
    else adjacency.set(e.from, [e.to]);
  }

  const uniquePaths = new Set<string>();
  const results: string[][] = [];

  const dfs = (currentId: string, remainingDepth: number, path: string[]) => {
    if (remainingDepth === 0) return;

    const nextIds = adjacency.get(currentId) ?? [];
    for (const nextId of nextIds) {
      // cycle-safe: never revisit a node already on the current path
      if (path.includes(nextId)) continue;

      const nextPath = [...path, nextId];
      const key = nextPath.join('>');
      if (!uniquePaths.has(key)) {
        uniquePaths.add(key);
        results.push(nextPath);
      }

      dfs(nextId, remainingDepth - 1, nextPath);
    }
  };

  dfs(rootId, maxDepth, [rootId]);
  return results;
}
