"use client";

import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), { ssr: false });

interface SessionNode {
  id: string;
  subject: string;
  date: string;
  engagement: number;
  eyeContact: number;
  talkBalance: number;
  interruptions: number;
  duration: number;
  student: string;
}

const STUDENT_COLORS: Record<string, string> = {
  "Sarah Chen": "#2D9D5E",
  "Alex Rivera": "#2B86C5",
  "Jordan Patel": "#E8573A",
  "Casey Kim": "#8B5CF6",
  "Morgan Davis": "#E8873A",
};

const METRIC_COLORS: Record<string, string> = {
  eye: "#2B86C5",
  talk: "#8B5CF6",
  int: "#E8573A",
  dur: "#2D9D5E",
};

const METRIC_LABELS: Record<string, string> = {
  eye: "Eye Contact",
  talk: "Talk Balance",
  int: "Interruptions",
  dur: "Duration",
};

const PULSE_YELLOW = "#FFD700";

/* ── text-label helper ─────────────────────────────────────────── */
function makeLabelSprite(
  THREE: any,
  lines: string[],
  opts: { fontSize?: number; bg?: string; fg?: string; accent?: string; width?: number; scale?: number } = {}
) {
  const fontSize = opts.fontSize ?? 28;
  const bg = opts.bg ?? "rgba(0,0,0,0.78)";
  const fg = opts.fg ?? "#fff";
  const accent = opts.accent ?? "#FFE082";
  const canvasW = opts.width ?? 512;
  const lineH = fontSize * 1.35;
  const canvasH = Math.max(64, lines.length * lineH + 24);
  const spriteScale = opts.scale ?? 40;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW * 2;
  canvas.height = canvasH * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);

  const r = 10, pad = 6;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(pad + r, pad);
  ctx.lineTo(canvasW - pad - r, pad);
  ctx.quadraticCurveTo(canvasW - pad, pad, canvasW - pad, pad + r);
  ctx.lineTo(canvasW - pad, canvasH - pad - r);
  ctx.quadraticCurveTo(canvasW - pad, canvasH - pad, canvasW - pad - r, canvasH - pad);
  ctx.lineTo(pad + r, canvasH - pad);
  ctx.quadraticCurveTo(pad, canvasH - pad, pad, canvasH - pad - r);
  ctx.lineTo(pad, pad + r);
  ctx.quadraticCurveTo(pad, pad, pad + r, pad);
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((text, i) => {
    const isFirst = i === 0;
    ctx.fillStyle = isFirst ? fg : accent;
    ctx.font = `${isFirst ? "bold " : ""}${fontSize}px Inter, system-ui, sans-serif`;
    ctx.fillText(text, canvasW / 2, 12 + i * lineH, canvasW - 24);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(spriteScale, spriteScale * (canvasH / canvasW), 1);
  return sprite;
}

export function SessionGraph3D({ sessions }: { sessions: SessionNode[] }) {
  const fgRef = useRef<any>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightMetricKey, setHighlightMetricKey] = useState<string | null>(null);
  // Track which links are currently "pulsing"
  const [pulsingLinks, setPulsingLinks] = useState<Set<string>>(new Set());
  const pulseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const graphData = useMemo(() => {
    const nodes: any[] = [];
    const links: any[] = [];

    sessions.forEach((s) => {
      nodes.push({
        id: s.id,
        name: s.student.split(" ")[0],
        fullName: s.student,
        subject: s.subject,
        val: 18 + s.duration / 6,
        color: STUDENT_COLORS[s.student] || "#888",
        type: "session",
        engagement: s.engagement,
        eyeContact: s.eyeContact,
        date: s.date,
        duration: s.duration,
        student: s.student,
      });

      const metrics = [
        { key: "eye", label: "Eye Contact", value: s.eyeContact },
        { key: "talk", label: "Talk Balance", value: s.talkBalance },
        { key: "int", label: "Interrupts", value: Math.min(100, s.interruptions * 20) },
        { key: "dur", label: "Duration", value: Math.min(100, s.duration * 2) },
      ];

      metrics.forEach((m) => {
        const mId = `${s.id}-${m.key}`;
        nodes.push({
          id: mId,
          name: m.label,
          val: 5 + m.value / 15,
          color: METRIC_COLORS[m.key],
          type: "metric",
          metricKey: m.key,
          metricValue: m.value,
          parentId: s.id,
          student: s.student,
        });
        links.push({
          source: s.id,
          target: mId,
          color: METRIC_COLORS[m.key] + "50",
          linkType: "session-metric",
          linkId: `${s.id}__${mId}`,
          pulseColor: PULSE_YELLOW,
        });
      });
    });

    // Same-student session links
    const studentSessions: Record<string, string[]> = {};
    sessions.forEach((s) => {
      if (!studentSessions[s.student]) studentSessions[s.student] = [];
      studentSessions[s.student].push(s.id);
    });
    Object.entries(studentSessions).forEach(([student, ids]) => {
      const sColor = STUDENT_COLORS[student] || "#888";
      for (let i = 1; i < ids.length; i++) {
        links.push({
          source: ids[i - 1],
          target: ids[i],
          color: sColor + "80",
          linkType: "same-student",
          linkId: `${ids[i - 1]}__${ids[i]}`,
          pulseColor: sColor,
        });
      }
    });

    // Same-metric-type links
    const metricGroups: Record<string, string[]> = {};
    nodes.filter((n) => n.type === "metric").forEach((n) => {
      if (!metricGroups[n.metricKey]) metricGroups[n.metricKey] = [];
      metricGroups[n.metricKey].push(n.id);
    });
    Object.entries(metricGroups).forEach(([key, ids]) => {
      for (let i = 1; i < ids.length; i++) {
        links.push({
          source: ids[i - 1],
          target: ids[i],
          color: (METRIC_COLORS[key] || "#888") + "30",
          linkType: "same-metric",
          linkId: `${ids[i - 1]}__${ids[i]}`,
          pulseColor: METRIC_COLORS[key] || "#888",
        });
      }
    });

    return { nodes, links };
  }, [sessions]);

  // Build adjacency
  const connectedIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const ids = new Set<string>([selectedNodeId]);
    graphData.links.forEach((l: any) => {
      const src = typeof l.source === "object" ? l.source.id : l.source;
      const tgt = typeof l.target === "object" ? l.target.id : l.target;
      if (src === selectedNodeId) ids.add(tgt);
      if (tgt === selectedNodeId) ids.add(src);
    });
    return ids;
  }, [selectedNodeId, graphData]);

  // Configure forces — keep simulation warm for dragging
  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force("charge")?.strength(-200);
      fgRef.current.d3Force("link")?.distance((link: any) => {
        if (link.linkType === "session-metric") return 50;
        if (link.linkType === "same-student") return 100;
        if (link.linkType === "same-metric") return 120;
        return 80;
      });
    }
  }, [graphData]);

  // Fire pulse particles along connected links
  const firePulse = useCallback((nodeId: string, node: any) => {
    if (!fgRef.current) return;
    const fg = fgRef.current;

    // Find links touching this node
    const directLinks: any[] = [];
    const extendedLinks: any[] = [];
    const clickedNode = graphData.nodes.find((n: any) => n.id === nodeId);

    graphData.links.forEach((l: any) => {
      const src = typeof l.source === "object" ? l.source.id : l.source;
      const tgt = typeof l.target === "object" ? l.target.id : l.target;
      if (src === nodeId || tgt === nodeId) {
        directLinks.push(l);
      }
    });

    // For session nodes: also pulse same-student links
    // For metric nodes: also pulse same-metric-type links
    if (clickedNode?.type === "session") {
      graphData.links.forEach((l: any) => {
        if (l.linkType === "same-student") {
          const src = typeof l.source === "object" ? l.source.id : l.source;
          const tgt = typeof l.target === "object" ? l.target.id : l.target;
          // Check if this link connects sessions of the same student
          const srcNode = graphData.nodes.find((n: any) => n.id === src);
          const tgtNode = graphData.nodes.find((n: any) => n.id === tgt);
          if (srcNode?.student === clickedNode.student || tgtNode?.student === clickedNode.student) {
            if (!directLinks.includes(l)) extendedLinks.push(l);
          }
        }
      });
    } else if (clickedNode?.type === "metric" && clickedNode.metricKey) {
      graphData.links.forEach((l: any) => {
        if (l.linkType === "same-metric") {
          const src = typeof l.source === "object" ? l.source.id : l.source;
          const tgt = typeof l.target === "object" ? l.target.id : l.target;
          const srcNode = graphData.nodes.find((n: any) => n.id === src);
          const tgtNode = graphData.nodes.find((n: any) => n.id === tgt);
          if (srcNode?.metricKey === clickedNode.metricKey || tgtNode?.metricKey === clickedNode.metricKey) {
            if (!directLinks.includes(l)) extendedLinks.push(l);
          }
        }
      });
    }

    // Collect all pulsing link IDs
    const allPulseIds = new Set<string>();
    [...directLinks, ...extendedLinks].forEach(l => allPulseIds.add(l.linkId));
    setPulsingLinks(allPulseIds);

    // Emit particles in waves
    const emitWave = (links: any[], delay: number) => {
      setTimeout(() => {
        links.forEach(l => {
          try { fg.emitParticle(l); } catch (_) { /* not all versions support this */ }
        });
      }, delay);
    };

    // Wave 1: direct connections (yellow pulse)
    emitWave(directLinks, 0);
    emitWave(directLinks, 150);
    emitWave(directLinks, 300);

    // Wave 2: extended connections (student-color or metric-color pulse)
    emitWave(extendedLinks, 400);
    emitWave(extendedLinks, 600);
    emitWave(extendedLinks, 800);

    // Clear pulse state after animation
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => setPulsingLinks(new Set()), 2500);
  }, [graphData]);

  const nodeThreeObject = useCallback(
    (node: any) => {
      const THREE = require("three");
      const isMetricHL = highlightMetricKey && node.type === "metric" && node.metricKey === highlightMetricKey;
      const hasSelection = !!selectedNodeId;
      const isConnected = connectedIds.has(node.id);
      const isSelected = selectedNodeId === node.id;
      const dimmed = hasSelection && !isConnected;

      if (node.type === "session") {
        const sz = isSelected ? node.val * 1.15 : node.val;
        const geo = new THREE.DodecahedronGeometry(sz, 1);
        const mat = new THREE.MeshPhongMaterial({
          color: node.color,
          transparent: true,
          opacity: dimmed ? 0.2 : 0.92,
          shininess: 80,
          flatShading: true,
          emissive: isSelected ? node.color : "#000000",
          emissiveIntensity: isSelected ? 0.3 : 0,
        });
        const mesh = new THREE.Mesh(geo, mat);

        const wire = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: dimmed ? 0.05 : 0.25 })
        );
        mesh.add(wire);

        if (isSelected) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(sz + 3, 1.2, 8, 48),
            new THREE.MeshBasicMaterial({ color: PULSE_YELLOW, transparent: true, opacity: 0.5 })
          );
          mesh.add(ring);
        }

        const label = makeLabelSprite(THREE, [
          node.fullName,
          `${node.subject}  ·  ${Math.round(node.duration)}m`,
          `${node.engagement}% engaged  ·  ${node.eyeContact}% eye`,
        ], {
          fontSize: 30, scale: 48, width: 540,
          bg: dimmed ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.78)",
          fg: dimmed ? "rgba(255,255,255,0.4)" : "#fff",
        });
        label.position.y = sz + 14;
        label.center.set(0.5, 0);

        const g = new THREE.Group();
        g.add(mesh);
        g.add(label);
        return g;
      } else {
        const baseSize = node.val;
        const isHL = isMetricHL || isSelected;
        const sz = isHL ? baseSize * 1.8 : baseSize;
        const geo = new THREE.SphereGeometry(sz, 24, 24);
        const mat = new THREE.MeshPhongMaterial({
          color: node.color,
          transparent: true,
          opacity: dimmed ? 0.15 : isHL ? 1 : 0.8,
          shininess: 60,
          emissive: isHL ? node.color : "#000000",
          emissiveIntensity: isHL ? 0.5 : 0,
        });
        const mesh = new THREE.Mesh(geo, mat);

        if (isHL) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(sz + 2, 0.8, 8, 32),
            new THREE.MeshBasicMaterial({ color: isMetricHL ? node.color : PULSE_YELLOW, transparent: true, opacity: 0.6 })
          );
          mesh.add(ring);
        }

        const label = makeLabelSprite(THREE, [
          node.name,
          `${node.metricValue}%`,
        ], {
          fontSize: 26, scale: 32, width: 360, accent: "#FFE082",
          bg: dimmed ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.78)",
          fg: dimmed ? "rgba(255,255,255,0.3)" : "#fff",
        });
        label.position.y = sz + 8;
        label.center.set(0.5, 0);

        const g = new THREE.Group();
        g.add(mesh);
        g.add(label);
        return g;
      }
    },
    [highlightMetricKey, selectedNodeId, connectedIds]
  );

  const handleNodeClick = useCallback(
    (node: any) => {
      if (!node) return;

      // Toggle selection
      if (selectedNodeId === node.id) {
        setSelectedNodeId(null);
        setHighlightMetricKey(null);
        setPulsingLinks(new Set());
        return;
      }

      setSelectedNodeId(node.id);

      // Highlight same-type metrics
      if (node.type === "metric" && node.metricKey) {
        setHighlightMetricKey(node.metricKey);
      } else {
        setHighlightMetricKey(null);
      }

      // Fire electric pulse animation
      firePulse(node.id, node);

      // Fly camera toward clicked node
      if (fgRef.current) {
        const dist = 120;
        const ratio = 1 + dist / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
        fgRef.current.cameraPosition(
          { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
          node,
          800
        );
      }
    },
    [selectedNodeId, firePulse]
  );

  const handleBackgroundClick = useCallback(() => {
    setSelectedNodeId(null);
    setHighlightMetricKey(null);
    setPulsingLinks(new Set());
  }, []);

  const handleCenterView = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.cameraPosition({ x: 0, y: 0, z: 400 }, { x: 0, y: 0, z: 0 }, 800);
    }
  }, []);

  return (
    <div className="graph-3d-container" style={{ position: "relative" }}>
      {/* Controls */}
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 20, display: "flex", gap: 8 }}>
        <button
          onClick={handleCenterView}
          style={{
            background: "rgba(255,255,255,0.94)",
            border: "1px solid #d0c8c0",
            borderRadius: 8,
            padding: "7px 16px",
            fontSize: 13,
            fontWeight: 600,
            color: "#444",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          &#x2299; Center
        </button>
      </div>

      {/* Selection / highlight indicator */}
      {(selectedNodeId || highlightMetricKey) && (
        <div style={{
          position: "absolute", top: 12, left: 12, zIndex: 20,
          background: highlightMetricKey ? METRIC_COLORS[highlightMetricKey] + "EE" : "rgba(0,0,0,0.85)",
          color: "white", borderRadius: 8, padding: "7px 16px",
          fontSize: 13, fontWeight: 600,
          boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
          maxWidth: 300,
        }}>
          {highlightMetricKey
            ? `Showing all ${METRIC_LABELS[highlightMetricKey]} nodes`
            : "Node selected — showing connections"}
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Click again or background to deselect</div>
        </div>
      )}

      {/* Instructions */}
      <div style={{
        position: "absolute", bottom: 50, left: 12, zIndex: 20,
        background: "rgba(255,255,255,0.85)", borderRadius: 8,
        padding: "6px 12px", fontSize: 11, color: "#666",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        Drag nodes to move · Left-drag: rotate · Right-drag: pan · Scroll: zoom · Click: select &amp; pulse
      </div>

      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        nodeLabel={(node: any) =>
          node.type === "session"
            ? `<div style="background:rgba(0,0,0,0.9);color:white;padding:10px 14px;border-radius:8px;font-size:14px;max-width:260px;line-height:1.5">
                <strong style="font-size:16px">${node.fullName}</strong><br/>
                ${node.subject} &middot; ${node.date}<br/>
                Engagement: <strong>${node.engagement}%</strong><br/>
                Eye Contact: <strong>${node.eyeContact}%</strong><br/>
                Duration: <strong>${Math.round(node.duration)}m</strong>
              </div>`
            : `<div style="background:rgba(0,0,0,0.9);color:white;padding:8px 12px;border-radius:6px;font-size:13px;line-height:1.4">
                <strong>${node.name}</strong>: ${node.metricValue}%<br/>
                <span style="font-size:11px;opacity:0.7">Click to select &amp; pulse connections</span>
              </div>`
        }
        /* ── Link appearance ── */
        linkColor={(link: any) => {
          if (!selectedNodeId) return link.color;
          const src = typeof link.source === "object" ? link.source.id : link.source;
          const tgt = typeof link.target === "object" ? link.target.id : link.target;
          const touches = src === selectedNodeId || tgt === selectedNodeId;
          if (touches) return link.color?.slice(0, 7) + "FF";
          // Also brighten same-student or same-metric extended links
          if (pulsingLinks.has(link.linkId)) return link.pulseColor || link.color?.slice(0, 7) + "CC";
          return link.color?.slice(0, 7) + "10";
        }}
        linkWidth={(link: any) => {
          if (selectedNodeId) {
            const src = typeof link.source === "object" ? link.source.id : link.source;
            const tgt = typeof link.target === "object" ? link.target.id : link.target;
            if (src === selectedNodeId || tgt === selectedNodeId) return 3.5;
            if (pulsingLinks.has(link.linkId)) return 2.5;
            return 0.3;
          }
          if (link.linkType === "same-student") return 2;
          if (link.linkType === "same-metric") return 1;
          return 0.6;
        }}
        linkOpacity={0.6}
        /* ── Directional particles for electric pulse ── */
        linkDirectionalParticles={(link: any) => {
          if (pulsingLinks.has(link.linkId)) return 6;
          return 0;
        }}
        linkDirectionalParticleSpeed={0.02}
        linkDirectionalParticleWidth={(link: any) => {
          if (pulsingLinks.has(link.linkId)) return 4;
          return 0;
        }}
        linkDirectionalParticleColor={(link: any) => {
          return link.pulseColor || PULSE_YELLOW;
        }}
        /* ── General config ── */
        backgroundColor="#F0E8E0"
        width={undefined}
        height={550}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        onNodeDrag={(node: any) => {
          // Unpin while dragging so physics responds
          node.fx = node.x;
          node.fy = node.y;
          node.fz = node.z;
        }}
        onNodeDragEnd={(node: any) => {
          // Release — let physics pull it back gently
          node.fx = undefined;
          node.fy = undefined;
          node.fz = undefined;
        }}
        enableNodeDrag={true}
        enableNavigationControls={true}
        showNavInfo={false}
        warmupTicks={80}
        cooldownTicks={200}
      />
      <div className="graph-legend" style={{ position: "relative", zIndex: 10, marginTop: -8, flexWrap: "wrap" }}>
        {Object.entries(STUDENT_COLORS).map(([name, color]) => (
          <span key={name}>
            <span className="legend-dot" style={{ background: color, width: 10, height: 10, display: "inline-block", borderRadius: "50%" }} /> {name.split(" ")[0]}
          </span>
        ))}
        <span style={{ marginLeft: 16, borderLeft: "2px solid #ddd", paddingLeft: 16 }} />
        {Object.entries(METRIC_COLORS).map(([key, color]) => (
          <span key={key}>
            <span className="legend-dot" style={{ background: color, width: 8, height: 8, display: "inline-block", borderRadius: "50%" }} /> {METRIC_LABELS[key]}
          </span>
        ))}
      </div>
    </div>
  );
}
