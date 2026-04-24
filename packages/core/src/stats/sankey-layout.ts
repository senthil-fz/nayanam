// Pure geometry for the Sankey chart. Shared by web (SVG) + mobile
// (`react-native-svg`) so both platforms render identical layouts from the
// same API response.
//
// Algorithm:
//   1. Partition nodes into two columns:
//        left  = kind === 'income'
//        right = kind in {expense, savings, transfer_out}
//   2. For each column, each node's total flow = sum of `|link.amountMinor|`
//      touching it. Columns that have zero total flow degenerate to no
//      layout (return empty result).
//   3. Sort each column by total flow DESC (stable tiebreaker by node id).
//      Sorting is input-stable: calling the function twice with the same
//      payload yields the same geometry.
//   4. Allocate column heights proportional to flow share, subtract gap
//      padding, place top-to-bottom.
//   5. For each node, maintain an "outgoing cursor" (left column) or
//      "incoming cursor" (right column) y-offset; each link gets a slice of
//      the node's height proportional to `link.amountMinor / node.totalFlow`.
//   6. Emit cubic Bezier paths between the left edge of the source's right
//      side and the right edge of the target's left side.
//
// Rounding drift: link heights use floats; we don't snap to integer pixels.
// `d3-sankey` does rounding reconciliation — we don't, because a half-pixel
// difference is visually indistinguishable at chart scale.

import type { SankeyLinkType, SankeyNodeType } from './schemas';

export type SankeyLayoutOptions = {
  width: number;
  height: number;
  /** Horizontal padding around the whole chart. Default 0. */
  padding?: number;
  /** Node bar width. Default 14. */
  nodeWidth?: number;
  /** Pixel gap between stacked nodes in a column. Default 8. */
  nodeGap?: number;
};

export type LaidOutNode = {
  id: string;
  kind: SankeyNodeType['kind'];
  label: string;
  colorToken?: string | null;
  /** Top-left x of the node rectangle. */
  x: number;
  /** Top-left y of the node rectangle. */
  y: number;
  width: number;
  height: number;
  /** Sum of |link.amountMinor| for links touching this node, as a JS number. */
  totalFlowMinor: number;
};

export type LaidOutLink = {
  sourceId: string;
  targetId: string;
  amountMinor: string;
  /** SVG path `d` — cubic Bezier between source right edge and target left edge. */
  path: string;
  /** Stroke width (= link height at the attachment point). */
  strokeWidth: number;
  /** Y of the midpoint on the source side (for gradient stops). */
  sourceY: number;
  /** Y of the midpoint on the target side. */
  targetY: number;
  sourceColorToken?: string | null;
  targetColorToken?: string | null;
};

export type SankeyLayoutResult = {
  width: number;
  height: number;
  nodes: LaidOutNode[];
  links: LaidOutLink[];
};

// Internal accumulator type during layout.
type ColumnSide = 'left' | 'right';

function parseAmount(s: string): number {
  // `amountMinor` is a decimal string. JS number is enough for Sankey
  // proportions (≤ 2^53 - 1 minor units = ~$90 trillion, way beyond any
  // household). If we ever need bigint here, swap to bigint arithmetic.
  const n = Number(s);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

export function layoutSankey(
  nodes: ReadonlyArray<SankeyNodeType>,
  links: ReadonlyArray<SankeyLinkType>,
  opts: SankeyLayoutOptions,
): SankeyLayoutResult {
  const width = opts.width;
  const height = opts.height;
  const padding = opts.padding ?? 0;
  const nodeWidth = opts.nodeWidth ?? 14;
  const nodeGap = opts.nodeGap ?? 8;

  const empty: SankeyLayoutResult = { width, height, nodes: [], links: [] };
  if (nodes.length === 0 || links.length === 0) return empty;

  // Index nodes for fast lookup.
  const nodesById = new Map<string, SankeyNodeType>();
  for (const n of nodes) nodesById.set(n.id, n);

  // Sum flow per node from the links. Discard links referencing unknown nodes.
  const flowPerNode = new Map<string, number>();
  const validLinks: Array<{ link: SankeyLinkType; amount: number }> = [];
  for (const link of links) {
    if (!nodesById.has(link.source) || !nodesById.has(link.target)) continue;
    const amount = parseAmount(link.amountMinor);
    if (amount <= 0) continue;
    validLinks.push({ link, amount });
    flowPerNode.set(link.source, (flowPerNode.get(link.source) ?? 0) + amount);
    flowPerNode.set(link.target, (flowPerNode.get(link.target) ?? 0) + amount);
  }
  if (validLinks.length === 0) return empty;

  // Partition into columns. Drop nodes with zero flow (unreachable).
  const leftColumn: LaidOutNode[] = [];
  const rightColumn: LaidOutNode[] = [];
  for (const n of nodes) {
    const flow = flowPerNode.get(n.id) ?? 0;
    if (flow <= 0) continue;
    const out: LaidOutNode = {
      id: n.id,
      kind: n.kind,
      label: n.label,
      colorToken: n.colorToken ?? null,
      x: 0,
      y: 0,
      width: nodeWidth,
      height: 0,
      totalFlowMinor: flow,
    };
    if (n.kind === 'income') leftColumn.push(out);
    else rightColumn.push(out);
  }
  if (leftColumn.length === 0 || rightColumn.length === 0) return empty;

  // Sort each column by flow DESC (stable tiebreak by id).
  const byFlowDesc = (a: LaidOutNode, b: LaidOutNode) => {
    if (b.totalFlowMinor !== a.totalFlowMinor) {
      return b.totalFlowMinor - a.totalFlowMinor;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  leftColumn.sort(byFlowDesc);
  rightColumn.sort(byFlowDesc);

  // Compute vertical geometry per column.
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = Math.max(1, innerBottom - innerTop);

  function layoutColumn(col: LaidOutNode[], side: ColumnSide) {
    const total = col.reduce((s, n) => s + n.totalFlowMinor, 0);
    if (total <= 0) return;
    const totalGap = nodeGap * Math.max(0, col.length - 1);
    const available = Math.max(1, innerHeight - totalGap);
    let cursor = innerTop;
    for (const n of col) {
      const h = (n.totalFlowMinor / total) * available;
      n.height = h;
      n.y = cursor;
      n.x = side === 'left' ? padding : width - padding - nodeWidth;
      cursor += h + nodeGap;
    }
  }

  layoutColumn(leftColumn, 'left');
  layoutColumn(rightColumn, 'right');

  // Attachment cursors per node — map id → current y-offset within the node.
  const cursorLeft = new Map<string, number>();
  const cursorRight = new Map<string, number>();
  for (const n of leftColumn) cursorLeft.set(n.id, n.y);
  for (const n of rightColumn) cursorRight.set(n.id, n.y);

  const laidOutNodesById = new Map<string, LaidOutNode>();
  for (const n of leftColumn) laidOutNodesById.set(n.id, n);
  for (const n of rightColumn) laidOutNodesById.set(n.id, n);

  // Emit links. Sort by (source order, target order) for stable render.
  const orderIndex = new Map<string, number>();
  leftColumn.forEach((n, i) => orderIndex.set(n.id, i));
  rightColumn.forEach((n, i) => orderIndex.set(n.id, leftColumn.length + i));
  const linksSorted = [...validLinks].sort((a, b) => {
    const sa = orderIndex.get(a.link.source) ?? 0;
    const sb = orderIndex.get(b.link.source) ?? 0;
    if (sa !== sb) return sa - sb;
    const ta = orderIndex.get(a.link.target) ?? 0;
    const tb = orderIndex.get(b.link.target) ?? 0;
    return ta - tb;
  });

  const laidOutLinks: LaidOutLink[] = [];
  for (const { link, amount } of linksSorted) {
    const src = laidOutNodesById.get(link.source);
    const tgt = laidOutNodesById.get(link.target);
    if (!src || !tgt) continue;

    const srcShare = src.totalFlowMinor > 0 ? amount / src.totalFlowMinor : 0;
    const tgtShare = tgt.totalFlowMinor > 0 ? amount / tgt.totalFlowMinor : 0;
    const srcHeight = srcShare * src.height;
    const tgtHeight = tgtShare * tgt.height;

    const srcY0 = cursorLeft.get(src.id) ?? src.y;
    const tgtY0 = cursorRight.get(tgt.id) ?? tgt.y;
    cursorLeft.set(src.id, srcY0 + srcHeight);
    cursorRight.set(tgt.id, tgtY0 + tgtHeight);

    const srcMidY = srcY0 + srcHeight / 2;
    const tgtMidY = tgtY0 + tgtHeight / 2;
    const srcX = src.x + src.width;
    const tgtX = tgt.x;

    const cx = (srcX + tgtX) / 2;
    const path = `M ${srcX} ${srcMidY} C ${cx} ${srcMidY}, ${cx} ${tgtMidY}, ${tgtX} ${tgtMidY}`;
    // Average the two attachment heights — links rarely have identical
    // source/target shares (proportional allocation differs), but a single
    // stroke width gives a cleaner silhouette than a tapering path.
    const strokeWidth = Math.max(1, (srcHeight + tgtHeight) / 2);

    laidOutLinks.push({
      sourceId: src.id,
      targetId: tgt.id,
      amountMinor: link.amountMinor,
      path,
      strokeWidth,
      sourceY: srcMidY,
      targetY: tgtMidY,
      sourceColorToken: src.colorToken ?? null,
      targetColorToken: tgt.colorToken ?? null,
    });
  }

  return {
    width,
    height,
    nodes: [...leftColumn, ...rightColumn],
    links: laidOutLinks,
  };
}
