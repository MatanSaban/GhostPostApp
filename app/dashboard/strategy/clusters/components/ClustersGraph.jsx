'use client';

/**
 * ClustersGraph
 *
 * Pure SVG / trigonometric layout. One "system" per cluster (pillar at center,
 * members orbiting), systems packed into a grid. No D3, no force simulation.
 *
 * Features:
 *   - Stagger entry animation (CSS keyframe with overshoot easing)
 *   - Adaptive orbit radius + member size based on member count
 *   - Angle-based label positioning so labels radiate outward (no collisions on
 *     the top/bottom axis where labels naturally collide)
 *   - Wheel zoom (about the cursor) + drag pan + reset
 *
 * Filters out REJECTED clusters (their stuff isn't actionable).
 */

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import styles from './ClustersGraph.module.css';

const SYSTEM_SIZE = 340;
const PILLAR_R = 36;
const MAX_MEMBERS_PER_SYSTEM = 18;

// Tune orbit radius + member size to member count so layouts breathe at any scale.
function pickOrbitParams(memberCount) {
  if (memberCount <= 8) return { orbitR: 100, memberR: 14 };
  if (memberCount <= 12) return { orbitR: 115, memberR: 12 };
  return { orbitR: 130, memberR: 11 }; // 13–18
}

// Pick label position + text-anchor based on the member's orbital angle, so
// labels radiate outward instead of stacking above/below member circles.
function labelPosition(angle, mx, my, memberR) {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const gap = 6;
  // Side-anchored labels for left/right quadrants
  if (cosA > 0.35) {
    return { x: mx + memberR + gap, y: my + 4, anchor: 'start' };
  }
  if (cosA < -0.35) {
    return { x: mx - memberR - gap, y: my + 4, anchor: 'end' };
  }
  // Middle-anchored above/below for top/bottom quadrants
  const dy = sinA < 0 ? -memberR - gap : memberR + 12;
  return { x: mx, y: my + dy, anchor: 'middle' };
}

function truncate(s, n) {
  if (!s) return '';
  const str = String(s);
  return str.length <= n ? str : `${str.slice(0, n - 1)}…`;
}

export function ClustersGraph({ clusters, translations, onClusterClick }) {
  const visibleClusters = useMemo(
    () => (clusters || []).filter((c) => c.status !== 'REJECTED'),
    [clusters],
  );

  const N = visibleClusters.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(N)));
  const rows = Math.max(1, Math.ceil(N / cols));
  const canvasW = cols * SYSTEM_SIZE;
  const canvasH = rows * SYSTEM_SIZE;

  // Zoom/pan state (viewBox manipulation, no transform on the SVG itself).
  const svgRef = useRef(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: canvasW, h: canvasH });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startVbX: 0, startVbY: 0 });

  // Per-cluster drag offsets — translate a cluster system away from its grid slot.
  // Persisted only in component state (resets on remount) — it's a workspace tweak,
  // not a saved layout. We can persist later if users want.
  const [clusterOffsets, setClusterOffsets] = useState({});
  const [draggingCluster, setDraggingCluster] = useState(null);
  // Threshold (px) below which a mousedown→mouseup is treated as a click rather
  // than a drag — keeps "click pillar to edit" working on top of "drag pillar to move".
  const CLICK_DRAG_THRESHOLD_PX = 4;

  // Reset the viewBox whenever the underlying canvas dimensions change
  // (e.g. after a discovery run added a new cluster).
  useEffect(() => {
    setViewBox({ x: 0, y: 0, w: canvasW, h: canvasH });
  }, [canvasW, canvasH]);

  // React's onWheel is registered as passive, so preventDefault() inside it
  // doesn't actually stop the page scroll. Register manually with passive: false.
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
      // Only start a pan if the mousedown landed on empty SVG space, not on a
      // child element (member circle, pillar group, etc.).
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

  // Start a per-cluster drag when the pillar is mousedown'd. Tracks both
  // intent ("did the mouse move enough to count as a drag?") and the working
  // offset so we can update on mousemove.
  const startClusterDrag = useCallback(
    (cluster, e) => {
      e.stopPropagation();
      const offset = clusterOffsets[cluster.id] || { dx: 0, dy: 0 };
      setDraggingCluster({
        cluster,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startOffsetX: offset.dx,
        startOffsetY: offset.dy,
        didMove: false,
      });
    },
    [clusterOffsets],
  );

  const handleMouseMove = useCallback(
    (e) => {
      // Cluster drag wins over pan drag.
      if (draggingCluster) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const pxDx = e.clientX - draggingCluster.startClientX;
        const pxDy = e.clientY - draggingCluster.startClientY;
        // Convert pixel delta to SVG units using the live viewBox.
        const svgDx = (pxDx * viewBox.w) / rect.width;
        const svgDy = (pxDy * viewBox.h) / rect.height;
        const moved = Math.abs(pxDx) + Math.abs(pxDy) > CLICK_DRAG_THRESHOLD_PX;
        if (moved && !draggingCluster.didMove) {
          setDraggingCluster((prev) => (prev ? { ...prev, didMove: true } : prev));
        }
        setClusterOffsets((prev) => ({
          ...prev,
          [draggingCluster.cluster.id]: {
            dx: draggingCluster.startOffsetX + svgDx,
            dy: draggingCluster.startOffsetY + svgDy,
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
    [isDragging, draggingCluster, viewBox.w, viewBox.h],
  );

  // Track mouseup at the window level so releasing outside the SVG still ends the drag.
  useEffect(() => {
    if (!isDragging && !draggingCluster) return;
    const onUp = () => {
      // If a cluster was being dragged but barely moved, treat the gesture as
      // a click → open the edit modal. Otherwise just finalize the new position.
      if (draggingCluster && !draggingCluster.didMove) {
        onClusterClick?.(draggingCluster.cluster);
      }
      setDraggingCluster(null);
      setIsDragging(false);
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [isDragging, draggingCluster, onClusterClick]);

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

  if (visibleClusters.length === 0) return null;

  const gt = translations?.graph || {};

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

        {visibleClusters.map((cluster, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const cx = col * SYSTEM_SIZE + SYSTEM_SIZE / 2;
          const cy = row * SYSTEM_SIZE + SYSTEM_SIZE / 2;
          // zoomScale > 1 means the user has zoomed in (smaller viewBox).
          // We use it to relax the title truncation so labels reveal full text
          // as the canvas magnifies.
          const zoomScale = canvasW / Math.max(1, viewBox.w);
          const offset = clusterOffsets[cluster.id] || { dx: 0, dy: 0 };
          return (
            <ClusterSystem
              key={cluster.id}
              cluster={cluster}
              cx={cx}
              cy={cy}
              offset={offset}
              zoomScale={zoomScale}
              translations={translations}
              onPillarMouseDown={(e) => startClusterDrag(cluster, e)}
            />
          );
        })}
      </svg>
    </div>
  );
}

function ClusterSystem({
  cluster,
  cx,
  cy,
  offset = { dx: 0, dy: 0 },
  zoomScale = 1,
  translations,
  onPillarMouseDown,
}) {
  const allMembers = cluster.members || [];
  const orbitMembers = allMembers
    .filter((m) => m.id !== cluster.pillarEntityId)
    .slice(0, MAX_MEMBERS_PER_SYSTEM);
  const hiddenCount = Math.max(
    0,
    allMembers.length - (cluster.pillarEntityId ? 1 : 0) - orbitMembers.length,
  );
  const memberCount = allMembers.length;

  const { orbitR, memberR } = pickOrbitParams(orbitMembers.length);
  const orbitDash = cluster.status === 'DISCOVERED' ? '3 5' : 'none';
  const pillarFill = `url(#cluster-pillar-${cluster.status})`;

  const positions = orbitMembers.map((m, i) => {
    const angle = (i / Math.max(1, orbitMembers.length)) * 2 * Math.PI - Math.PI / 2;
    const x = cx + orbitR * Math.cos(angle);
    const y = cy + orbitR * Math.sin(angle);
    const label = labelPosition(angle, x, y, memberR);
    return { member: m, x, y, angle, label };
  });

  // Base truncation tightens for crowded orbits, then RELAXES as the user zooms in.
  // At zoomScale ≥ 2.5 we render the full label.
  const baseTruncLen = orbitMembers.length > 12 ? 10 : 14;
  const truncLen =
    zoomScale >= 2.5
      ? Number.MAX_SAFE_INTEGER
      : Math.floor(baseTruncLen * Math.max(1, Math.min(zoomScale, 2.5)));

  return (
    <g transform={`translate(${offset.dx}, ${offset.dy})`}>
      {/* Orbit ring */}
      <circle
        cx={cx}
        cy={cy}
        r={orbitR}
        className={styles.orbit}
        strokeDasharray={orbitDash}
      />

      {/* Connection lines pillar → member */}
      {positions.map((p) => (
        <line
          key={`l-${p.member.id}`}
          x1={cx}
          y1={cy}
          x2={p.x}
          y2={p.y}
          className={styles.connection}
        />
      ))}

      {/* Pillar — mousedown initiates drag-or-click. Click vs drag is decided
          on mouseup based on movement threshold. */}
      <g
        className={styles.pillarGroup}
        onMouseDown={onPillarMouseDown}
        style={{ cursor: 'grab' }}
      >
        <circle cx={cx} cy={cy} r={PILLAR_R} fill={pillarFill} className={styles.pillar} />
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className={styles.pillarText}
        >
          {truncate(cluster.name, 16)}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          dominantBaseline="middle"
          className={styles.pillarSubtext}
        >
          {memberCount}
        </text>
        <title>
          {cluster.name} — {cluster.mainKeyword} ({cluster.status})
        </title>
      </g>

      {/* Hidden-count badge below pillar */}
      {hiddenCount > 0 && (
        <g className={styles.hiddenBadge}>
          <rect x={cx - 26} y={cy + PILLAR_R + 6} width={52} height={18} rx={9} ry={9} />
          <text
            x={cx}
            y={cy + PILLAR_R + 19}
            textAnchor="middle"
            className={styles.hiddenBadgeText}
          >
            +{hiddenCount}
          </text>
        </g>
      )}

      {/* Members */}
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
    </g>
  );
}
