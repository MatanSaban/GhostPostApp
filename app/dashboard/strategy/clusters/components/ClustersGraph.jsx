'use client';

/**
 * ClustersGraph — radial-tree view of cluster trees (Phase 6).
 *
 * Each root cluster gets its own radial tree:
 *   - root pillar at its tree's center
 *   - depth-1 children fan out 360° around the root
 *   - depth-2+ grandchildren occupy a wedge centered on their parent's
 *     outward angle, so descendants always appear "outside" their ancestors
 *   - non-pillar members of any cluster orbit their pillar in a small inner
 *     ring (existing solar-system feel preserved at the per-cluster scale)
 *
 * Multiple roots are packed in a flow layout (rows of trees).
 *
 * Inherited from the previous solar-system layout:
 *   - viewBox-based zoom/pan + per-tree drag offsets
 *   - click vs drag threshold (click pillar opens edit modal)
 *   - REJECTED clusters and their entire subtrees are hidden
 *   - zoom-aware label truncation
 *
 * NEW (Phase 6):
 *   - Inter-pillar parent→child edges colored by Phase 4 link-gap counts
 *   - Pillar size scales with depth (root largest; leaves smallest)
 *   - Nested SVG groups: dragging any pillar moves its entire subtree
 */

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import styles from './ClustersGraph.module.css';

// Soft cap mirroring lib/cluster-tree.js MAX_DEPTH. Used only to size the
// per-depth distance/radius arrays — server enforces the real limit.
const MAX_DEPTH = 4;

// Distance from a parent pillar to each of its direct children. Index = depth
// of the CHILD. depth=1 children are 200px from the root; deeper levels pull
// in tighter so the tree stays compact even at MAX_DEPTH=4.
const LEVEL_DISTANCE = [0, 200, 130, 95, 75];

// Pillar radius shrinks with depth so the root reads as the visual center
// and leaves don't overpower the layout.
const PILLAR_R_BY_DEPTH = [36, 28, 22, 18, 16];

// Sub-wedge cap — once you're below the root, descendants fan into a wedge
// centered on their parent's outward angle. We clamp to ~75° so trees with
// many siblings don't loop back toward the root and overlap their cousins.
const MAX_SUBWEDGE = 1.3;

// Pad each tree's bounding box so adjacent roots don't collide visually.
const TREE_PADDING = 90;

// Member orbit (per-cluster inner ring) sizing. Capped tighter for sub-clusters
// whose pillars are smaller and have less canvas room.
function pickOrbitParams(memberCount, depth) {
  const scale = depth === 0 ? 1 : Math.max(0.6, 1 - depth * 0.15);
  if (memberCount <= 6) return { orbitR: 70 * scale, memberR: 12 * scale, max: memberCount };
  if (memberCount <= 10) return { orbitR: 80 * scale, memberR: 10 * scale, max: 10 };
  return { orbitR: 90 * scale, memberR: 9 * scale, max: 12 };
}

function labelPosition(angle, mx, my, memberR) {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const gap = 5;
  if (cosA > 0.35) return { x: mx + memberR + gap, y: my + 4, anchor: 'start' };
  if (cosA < -0.35) return { x: mx - memberR - gap, y: my + 4, anchor: 'end' };
  const dy = sinA < 0 ? -memberR - gap : memberR + 11;
  return { x: mx, y: my + dy, anchor: 'middle' };
}

function truncate(s, n) {
  if (!s) return '';
  const str = String(s);
  return str.length <= n ? str : `${str.slice(0, n - 1)}…`;
}

// Build a tree of {cluster, children[]}. Filters out REJECTED clusters and
// any cluster whose ancestor chain contains a REJECTED node — rejected
// branches don't render at all, matching v1+v2 behavior.
function buildVisibleTree(clusters) {
  const live = clusters.filter((c) => c.status !== 'REJECTED');
  const byId = new Map(live.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    if (c.parentClusterId && byId.has(c.parentClusterId)) {
      byId.get(c.parentClusterId).children.push(c);
    } else {
      // No parent in the visible set — render as root (handles real roots and
      // orphaned nodes whose parent was rejected/missing).
      roots.push(c);
    }
  }
  return roots;
}

/**
 * Lay out a single root tree radially.
 *
 * Returns:
 *   - layout: Map<clusterId, { dx, dy, depth, outwardAngle }>
 *             dx/dy are offsets from PARENT pillar (root's are 0,0).
 *             Used for nested-group rendering so dragging any pillar
 *             translates its whole subtree via SVG transform.
 *   - bbox:   absolute bounds for tree packing
 *
 * Algorithm: depth-first walk from root. Root spans 2π and centers its first
 * child at -π/2 (12 o'clock). Each subsequent depth gets a wedge centered on
 * its parent's outward angle, capped at MAX_SUBWEDGE so trees with many
 * siblings stay readable.
 */
function layoutTree(root) {
  const abs = new Map();

  function place(node, x, y, parentOutwardAngle, wedge, depth) {
    abs.set(node.id, { absX: x, absY: y, depth, outwardAngle: parentOutwardAngle });
    const children = node.children || [];
    if (children.length === 0) return;
    const dist = LEVEL_DISTANCE[depth + 1] || LEVEL_DISTANCE[LEVEL_DISTANCE.length - 1];
    const childCount = children.length;
    // Root fans 360° starting at -π/2 so the first child is at the top.
    // Deeper levels share a wedge of size `wedge` centered on parentOutwardAngle.
    const span = depth === 0 ? 2 * Math.PI : Math.min(wedge, MAX_SUBWEDGE);
    const step = span / childCount;
    const start =
      depth === 0
        ? -Math.PI / 2 + step / 2
        : parentOutwardAngle - span / 2 + step / 2;
    children.forEach((child, i) => {
      const angle = start + step * i;
      const cx = x + dist * Math.cos(angle);
      const cy = y + dist * Math.sin(angle);
      // Sub-wedge: each child gets a fraction of its share, capped tighter.
      // The 0.85 multiplier prevents grandchildren from spilling into siblings.
      const sub = Math.min(step * 0.85, MAX_SUBWEDGE);
      place(child, cx, cy, angle, sub, depth + 1);
    });
  }
  place(root, 0, 0, 0, 0, 0);

  // Convert absolute to relative deltas for nested-group rendering.
  const layout = new Map();
  function relativize(node, parentAbsX, parentAbsY) {
    const a = abs.get(node.id);
    layout.set(node.id, {
      dx: a.absX - parentAbsX,
      dy: a.absY - parentAbsY,
      depth: a.depth,
      outwardAngle: a.outwardAngle,
    });
    for (const child of node.children || []) {
      relativize(child, a.absX, a.absY);
    }
  }
  relativize(root, 0, 0);

  // Bounding box for packing — derived from absolute positions so we account
  // for pillar radius + member orbit radius at each node.
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (const { absX, absY, depth } of abs.values()) {
    const r = (PILLAR_R_BY_DEPTH[depth] || 16) + pickOrbitParams(0, depth).orbitR;
    if (absX - r < minX) minX = absX - r;
    if (absX + r > maxX) maxX = absX + r;
    if (absY - r < minY) minY = absY - r;
    if (absY + r > maxY) maxY = absY + r;
  }

  return {
    layout,
    bbox: {
      minX: minX - TREE_PADDING,
      minY: minY - TREE_PADDING,
      maxX: maxX + TREE_PADDING,
      maxY: maxY + TREE_PADDING,
      width: maxX - minX + 2 * TREE_PADDING,
      height: maxY - minY + 2 * TREE_PADDING,
    },
  };
}

/**
 * Pack root trees into a flow layout (rows of trees), wrapping when total
 * row width would exceed targetRowWidth. Returns an array of
 * { rootId, layout, bbox, originX, originY } where originX/Y is where the
 * root pillar should land on the canvas.
 */
function packRoots(rootTrees, targetRowWidth = 1400) {
  const placed = [];
  let rowX = 0;
  let rowY = 0;
  let rowMaxHeight = 0;
  for (const t of rootTrees) {
    if (rowX > 0 && rowX + t.bbox.width > targetRowWidth) {
      // Wrap to next row.
      rowY += rowMaxHeight;
      rowX = 0;
      rowMaxHeight = 0;
    }
    placed.push({
      ...t,
      // Origin = where (0,0) in this tree's local coords lands on the canvas.
      // Shift by -bbox.minX so the leftmost extent sits at rowX.
      originX: rowX - t.bbox.minX,
      originY: rowY - t.bbox.minY,
    });
    rowX += t.bbox.width;
    if (t.bbox.height > rowMaxHeight) rowMaxHeight = t.bbox.height;
  }
  const totalHeight = rowY + rowMaxHeight;
  // totalWidth is the natural row width — capped at the largest packed row
  // so very narrow trees don't bloat the canvas.
  const totalWidth = Math.max(...placed.map((p) => p.originX + p.bbox.maxX), 0);
  return { placed, canvasW: totalWidth, canvasH: totalHeight };
}

// Edge color reflects health between a child's content and its parent's
// pillar. Phase 4's `linkGapsByType` powers this:
//   - PARENT gaps   = members of the child cluster that don't link back to
//                     the child's own pillar — directly weakens the
//                     parent→child structural link this edge represents.
//   - ANCESTOR gaps = a softer warning (members not climbing to root).
// Discovered/no-health-data clusters get the neutral edge.
function edgeClassFor(childCluster) {
  const t = childCluster?.health?.totals?.linkGapsByType;
  if (!t) return styles.edgeNeutral;
  if ((t.PARENT || 0) > 0) return styles.edgeWarn;
  if ((t.ANCESTOR || 0) > 0) return styles.edgeSoftWarn;
  return styles.edgeOk;
}

export function ClustersGraph({ clusters, translations, onClusterClick }) {
  // Build a tree once per cluster list — same flat-to-tree logic as the list
  // view but without REJECTED branches.
  const rootTrees = useMemo(() => {
    const roots = buildVisibleTree(clusters || []);
    return roots.map((root) => {
      const { layout, bbox } = layoutTree(root);
      return { rootId: root.id, root, layout, bbox };
    });
  }, [clusters]);

  // Pack the trees into a canvas. Re-pack when the tree set changes — the
  // viewBox snaps to the new canvas size in the effect below.
  const { placed, canvasW, canvasH } = useMemo(() => {
    if (rootTrees.length === 0) return { placed: [], canvasW: 800, canvasH: 600 };
    return packRoots(rootTrees);
  }, [rootTrees]);

  // ── viewBox-based zoom/pan plumbing — preserved from v1+v2 graph ──────
  const svgRef = useRef(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: canvasW, h: canvasH });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startVbX: 0, startVbY: 0 });

  // Per-root drag offsets (the entire tree shifts; internal layout unchanged).
  const [rootOffsets, setRootOffsets] = useState({});
  const [draggingRoot, setDraggingRoot] = useState(null);
  const CLICK_DRAG_THRESHOLD_PX = 4;

  useEffect(() => {
    setViewBox({ x: 0, y: 0, w: canvasW || 800, h: canvasH || 600 });
  }, [canvasW, canvasH]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const rect = svg.getBoundingClientRect();
      if (!rect) return;
      setViewBox((prev) => {
        const newW = prev.w * factor;
        const newH = prev.h * factor;
        if (newW < canvasW / 8 || newW > canvasW * 4) return prev;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const svgX = prev.x + (mouseX / rect.width) * prev.w;
        const svgY = prev.y + (mouseY / rect.height) * prev.h;
        return {
          x: svgX - (mouseX / rect.width) * newW,
          y: svgY - (mouseY / rect.height) * newH,
          w: newW,
          h: newH,
        };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [canvasW]);

  const handleMouseDown = useCallback(
    (e) => {
      if (e.target !== svgRef.current) return;
      setIsDragging(true);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startVbX: viewBox.x,
        startVbY: viewBox.y,
      };
    },
    [viewBox.x, viewBox.y],
  );

  // Start a per-tree drag when ANY pillar in the tree is mousedown'd. The
  // root's wrapping <g> carries the offset; every descendant lives inside
  // that <g>, so dragging shifts the whole subtree visually.
  const startRootDrag = useCallback(
    (rootId, cluster, e) => {
      e.stopPropagation();
      const offset = rootOffsets[rootId] || { dx: 0, dy: 0 };
      setDraggingRoot({
        rootId,
        clickedCluster: cluster,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startOffsetX: offset.dx,
        startOffsetY: offset.dy,
        didMove: false,
      });
    },
    [rootOffsets],
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (draggingRoot) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const pxDx = e.clientX - draggingRoot.startClientX;
        const pxDy = e.clientY - draggingRoot.startClientY;
        const svgDx = (pxDx * viewBox.w) / rect.width;
        const svgDy = (pxDy * viewBox.h) / rect.height;
        const moved = Math.abs(pxDx) + Math.abs(pxDy) > CLICK_DRAG_THRESHOLD_PX;
        if (moved && !draggingRoot.didMove) {
          setDraggingRoot((prev) => (prev ? { ...prev, didMove: true } : prev));
        }
        setRootOffsets((prev) => ({
          ...prev,
          [draggingRoot.rootId]: {
            dx: draggingRoot.startOffsetX + svgDx,
            dy: draggingRoot.startOffsetY + svgDy,
          },
        }));
        return;
      }

      if (!isDragging) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setViewBox((prev) => ({
        ...prev,
        x: dragRef.current.startVbX - (dx * prev.w) / rect.width,
        y: dragRef.current.startVbY - (dy * prev.h) / rect.height,
      }));
    },
    [isDragging, draggingRoot, viewBox.w, viewBox.h],
  );

  useEffect(() => {
    if (!isDragging && !draggingRoot) return;
    const onUp = () => {
      // Fire the click handler with the SPECIFIC pillar that was mousedown'd —
      // not necessarily the root. Lets the user click any pillar in the tree
      // to open its edit modal, while still allowing tree-drag from the same
      // gesture (movement threshold decides which one wins).
      if (draggingRoot && !draggingRoot.didMove) {
        onClusterClick?.(draggingRoot.clickedCluster);
      }
      setDraggingRoot(null);
      setIsDragging(false);
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [isDragging, draggingRoot, onClusterClick]);

  const zoomIn = () =>
    setViewBox((p) => ({
      ...p,
      x: p.x + p.w * 0.1,
      y: p.y + p.h * 0.1,
      w: p.w * 0.8,
      h: p.h * 0.8,
    }));
  const zoomOut = () =>
    setViewBox((p) => ({
      ...p,
      x: p.x - p.w * 0.125,
      y: p.y - p.h * 0.125,
      w: p.w * 1.25,
      h: p.h * 1.25,
    }));
  const reset = () => setViewBox({ x: 0, y: 0, w: canvasW, h: canvasH });

  if (placed.length === 0) return null;

  const gt = translations?.graph || {};
  const zoomScale = canvasW / Math.max(1, viewBox.w);

  return (
    <div className={styles.graphScroll}>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={zoomIn}
          aria-label={gt.zoomIn || 'Zoom in'}
          title={gt.zoomIn || 'Zoom in'}
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={zoomOut}
          aria-label={gt.zoomOut || 'Zoom out'}
          title={gt.zoomOut || 'Zoom out'}
        >
          <ZoomOut size={14} />
        </button>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={reset}
          aria-label={gt.resetView || 'Reset view'}
          title={gt.resetView || 'Reset view'}
        >
          <Maximize2 size={14} />
        </button>
      </div>
      <svg
        ref={svgRef}
        className={`${styles.graph} ${isDragging ? styles.dragging : ''}`}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        role="img"
      >
        <defs>
          <radialGradient id="cluster-pillar-CONFIRMED" cx="35%" cy="35%">
            <stop offset="0%" stopColor="#86efac" />
            <stop offset="100%" stopColor="#16a34a" />
          </radialGradient>
          <radialGradient id="cluster-pillar-DISCOVERED" cx="35%" cy="35%">
            <stop offset="0%" stopColor="#93c5fd" />
            <stop offset="100%" stopColor="#2563eb" />
          </radialGradient>
        </defs>

        {placed.map((tree) => {
          const userOffset = rootOffsets[tree.rootId] || { dx: 0, dy: 0 };
          // Translate the entire tree to its packed position + any user drag.
          return (
            <g
              key={tree.rootId}
              transform={`translate(${tree.originX + userOffset.dx}, ${tree.originY + userOffset.dy})`}
            >
              <ClusterNode
                cluster={tree.root}
                layout={tree.layout}
                rootId={tree.rootId}
                onPillarMouseDown={startRootDrag}
                zoomScale={zoomScale}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Recursive renderer: one cluster's pillar + members + edges to its children
 * + nested ClusterNode for each child.
 *
 * Children render AFTER edges so connection lines sit underneath the child
 * pillars. Each child wraps in its own `<g transform="translate(dx,dy)">` —
 * dragging any pillar updates the root's transform, and the descendants ride
 * along automatically (they're inside the same root group).
 */
function ClusterNode({ cluster, layout, rootId, onPillarMouseDown, zoomScale }) {
  const entry = layout.get(cluster.id);
  if (!entry) return null;
  const { dx, dy, depth } = entry;

  // Members of THIS cluster that should orbit its pillar:
  //   - Skip the pillar itself (it IS the cluster's center).
  //   - Skip any member that is the pillar of one of this cluster's children
  //     — those entities are rendered as child pillars in the tree, not as
  //     orbital satellites here.
  const childPillarIds = new Set(
    (cluster.children || []).map((c) => c.pillarEntityId).filter(Boolean),
  );
  const allMembers = cluster.members || [];
  const orbitMembers = allMembers.filter(
    (m) => m.id !== cluster.pillarEntityId && !childPillarIds.has(m.id),
  );
  const { orbitR, memberR, max } = pickOrbitParams(orbitMembers.length, depth);
  const visibleMembers = orbitMembers.slice(0, max);
  const hiddenCount = orbitMembers.length - visibleMembers.length;

  const pillarR = PILLAR_R_BY_DEPTH[depth] || 16;
  const orbitDash = cluster.status === 'DISCOVERED' ? '3 5' : 'none';
  const pillarFill = `url(#cluster-pillar-${cluster.status})`;

  // Member ring positions — same formula as v1+v2.
  const positions = visibleMembers.map((m, i) => {
    const angle = (i / Math.max(1, visibleMembers.length)) * 2 * Math.PI - Math.PI / 2;
    const x = orbitR * Math.cos(angle);
    const y = orbitR * Math.sin(angle);
    const label = labelPosition(angle, x, y, memberR);
    return { member: m, x, y, angle, label };
  });

  // Truncation tightens for crowded orbits and for deeper clusters; relaxes
  // when the user zooms in.
  const baseTruncLen = depth === 0 ? 14 : 10;
  const truncLen =
    zoomScale >= 2.5
      ? Number.MAX_SAFE_INTEGER
      : Math.max(6, Math.floor(baseTruncLen * Math.max(1, Math.min(zoomScale, 2.5))));

  const memberCount = allMembers.length;

  return (
    <g transform={`translate(${dx}, ${dy})`}>
      {/* Edges to children — drawn first so child pillars overlap them */}
      {(cluster.children || []).map((child) => {
        const childEntry = layout.get(child.id);
        if (!childEntry) return null;
        return (
          <line
            key={`edge-${child.id}`}
            x1={0}
            y1={0}
            x2={childEntry.dx}
            y2={childEntry.dy}
            className={`${styles.treeEdge} ${edgeClassFor(child)}`}
          />
        );
      })}

      {/* Local member orbit ring — only render when this cluster has visible
          satellite members (sub-clusters whose all-members-are-children
          shouldn't draw an empty orbit). */}
      {orbitMembers.length > 0 && (
        <circle cx={0} cy={0} r={orbitR} className={styles.orbit} strokeDasharray={orbitDash} />
      )}

      {/* Connection lines pillar → member */}
      {positions.map((p) => (
        <line
          key={`l-${p.member.id}`}
          x1={0}
          y1={0}
          x2={p.x}
          y2={p.y}
          className={styles.connection}
        />
      ))}

      {/* Pillar — mousedown delegates to the root drag handler. Every pillar
          in the tree shares the same root-drag mechanism via the closure on
          rootId; click vs drag is decided at mouseup by movement threshold. */}
      <g
        className={styles.pillarGroup}
        onMouseDown={(e) => onPillarMouseDown(rootId, cluster, e)}
        style={{ cursor: 'grab' }}
      >
        <circle cx={0} cy={0} r={pillarR} fill={pillarFill} className={styles.pillar} />
        <text
          x={0}
          y={-2}
          textAnchor="middle"
          dominantBaseline="middle"
          className={styles.pillarText}
          style={{ fontSize: depth === 0 ? 11 : Math.max(8, 11 - depth) }}
        >
          {truncate(cluster.name, depth === 0 ? 16 : 12)}
        </text>
        <text
          x={0}
          y={depth === 0 ? 12 : 9}
          textAnchor="middle"
          dominantBaseline="middle"
          className={styles.pillarSubtext}
          style={{ fontSize: depth === 0 ? 9 : 8 }}
        >
          {memberCount}
        </text>
        <title>
          {cluster.name} — {cluster.mainKeyword} ({cluster.status})
        </title>
      </g>

      {/* +N hidden-members badge under the pillar (when orbit was capped) */}
      {hiddenCount > 0 && (
        <g className={styles.hiddenBadge}>
          <rect x={-22} y={pillarR + 4} width={44} height={16} rx={8} ry={8} />
          <text
            x={0}
            y={pillarR + 16}
            textAnchor="middle"
            className={styles.hiddenBadgeText}
          >
            +{hiddenCount}
          </text>
        </g>
      )}

      {/* Members — orbit ring */}
      {positions.map((p, i) => (
        <g
          key={`m-${p.member.id}`}
          className={styles.memberGroup}
          style={{ '--orbit-i': i }}
        >
          {p.member.url ? (
            <a href={p.member.url} target="_blank" rel="noopener noreferrer">
              <circle cx={p.x} cy={p.y} r={memberR} className={styles.member} />
              <title>{p.member.title}</title>
            </a>
          ) : (
            <>
              <circle cx={p.x} cy={p.y} r={memberR} className={styles.member} />
              <title>{p.member.title}</title>
            </>
          )}
          <text
            x={p.label.x}
            y={p.label.y}
            textAnchor={p.label.anchor}
            className={styles.memberLabel}
          >
            {truncate(p.member.title, truncLen)}
          </text>
        </g>
      ))}

      {/* Recurse into child clusters — wrapped in their own translate-group
          via this same component. Each child renders inside the parent's <g>
          so dragging the root translates the whole tree. */}
      {(cluster.children || []).map((child) => (
        <ClusterNode
          key={child.id}
          cluster={child}
          layout={layout}
          rootId={rootId}
          onPillarMouseDown={onPillarMouseDown}
          zoomScale={zoomScale}
        />
      ))}
    </g>
  );
}
