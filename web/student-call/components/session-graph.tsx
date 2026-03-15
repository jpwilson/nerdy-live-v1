"use client";

import { useEffect, useRef, useState } from "react";

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

interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  type: "session" | "metric";
  value?: number;
  icon?: string;
  parentId?: string;
  metricKey?: string;
  pulse?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  color: string;
}

const STUDENT_COLORS: Record<string, string> = {
  "Sarah Chen": "#2D9D5E",
  "Alex Rivera": "#2B86C5",
  "Jordan Patel": "#E8573A",
  "Casey Kim": "#8B5CF6",
  "Morgan Davis": "#E8873A",
};

function studentColor(name: string): string {
  return STUDENT_COLORS[name] || "#888";
}

function engColor(v: number): string {
  if (v >= 70) return "#2D9D5E";
  if (v >= 40) return "#E8873A";
  return "#C4402F";
}

function metricColor(type: string): string {
  switch (type) {
    case "eye": return "#2B86C5";
    case "talk": return "#8B5CF6";
    case "interrupts": return "#E8573A";
    case "duration": return "#2D9D5E";
    default: return "#888";
  }
}

export function SessionGraph({ sessions }: { sessions: SessionNode[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animRef = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [clickedNode, setClickedNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const isPanningRef = useRef(false);
  const lastPanRef = useRef({ x: 0, y: 0 });

  // Build graph data from sessions
  useEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = rect.width || 800;
    const h = Math.max(400, Math.min(600, w * 0.6));
    setDimensions({ w, h });

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const cx = w / 2;
    const cy = h / 2;

    // Create session nodes in a circle
    sessions.forEach((s, i) => {
      const angle = (i / sessions.length) * Math.PI * 2 - Math.PI / 2;
      const r = Math.min(w, h) * 0.28;
      const x = cx + Math.cos(angle) * r + (Math.random() - 0.5) * 30;
      const y = cy + Math.sin(angle) * r + (Math.random() - 0.5) * 30;
      const size = 18 + (s.engagement / 100) * 16;

      nodes.push({
        id: s.id,
        label: s.student?.split(" ")[0] || s.subject || "Session",
        x, y, z: (Math.random() - 0.5) * 200, vx: 0, vy: 0,
        radius: size,
        color: studentColor(s.student),
        type: "session",
        value: s.engagement,
      });

      // Metric child nodes
      const metrics = [
        { key: "eye", label: "Eye", value: s.eyeContact, icon: "👁" },
        { key: "talk", label: "Talk", value: s.talkBalance, icon: "🗣" },
        { key: "int", label: "Int", value: Math.min(100, s.interruptions * 20), icon: "⚡" },
        { key: "dur", label: "Dur", value: Math.min(100, s.duration * 2), icon: "⏱" },
      ];

      metrics.forEach((m, mi) => {
        const mAngle = angle + ((mi - 1.5) / 4) * 0.8;
        const mR = r + 50 + Math.random() * 20;
        const mId = `${s.id}-${m.key}`;
        nodes.push({
          id: mId,
          label: m.label,
          x: cx + Math.cos(mAngle) * mR,
          y: cy + Math.sin(mAngle) * mR,
          z: (Math.random() - 0.5) * 100,
          vx: 0, vy: 0,
          radius: 6 + (m.value / 100) * 8,
          color: metricColor(m.key),
          type: "metric",
          value: m.value,
          icon: m.icon,
          parentId: s.id,
          metricKey: m.key,
        });
        edges.push({ source: s.id, target: mId, color: metricColor(m.key) });
      });

      // Connect sequential sessions by same student
      const prevSameStudent = sessions.slice(0, i).reverse().find(ps => ps.student === s.student);
      if (prevSameStudent) {
        edges.push({
          source: prevSameStudent.id,
          target: s.id,
          color: "rgba(0,0,0,0.12)",
        });
      }
    });

    // Connect same-type metric nodes across sessions with faint lines
    const metricTypes = ["eye", "talk", "int", "dur"];
    for (const mType of metricTypes) {
      const metricNodes = nodes.filter(n => n.type === "metric" && n.id.endsWith(`-${mType}`));
      for (let i = 1; i < metricNodes.length; i++) {
        edges.push({
          source: metricNodes[i - 1].id,
          target: metricNodes[i].id,
          color: metricColor(mType) + "30", // very faint
        });
      }
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [sessions]);

  // Animation loop with force simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = dimensions;
    canvas.width = w * 2; // retina
    canvas.height = h * 2;
    ctx.scale(2, 2);

    let running = true;

    const tick = () => {
      if (!running) return;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;

      // Simple force simulation
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        // Repulsion between all nodes
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = a.radius + b.radius + 8;
          if (dist < minDist) {
            const force = (minDist - dist) * 0.03;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx -= fx; a.vy -= fy;
            b.vx += fx; b.vy += fy;
          }
        }
        // Edge spring force
        for (const e of edges) {
          if (e.source === a.id || e.target === a.id) {
            const other = nodes.find(n => n.id === (e.source === a.id ? e.target : e.source));
            if (!other) continue;
            const dx = other.x - a.x;
            const dy = other.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const targetDist = a.type === "metric" || other.type === "metric" ? 50 : 120;
            const force = (dist - targetDist) * 0.002;
            a.vx += (dx / dist) * force;
            a.vy += (dy / dist) * force;
          }
        }
        // Center gravity
        a.vx += (w / 2 - a.x) * 0.0003;
        a.vy += (h / 2 - a.y) * 0.0003;
        // Damping
        a.vx *= 0.92;
        a.vy *= 0.92;
        a.x += a.vx;
        a.y += a.vy;
        // Bounds
        a.x = Math.max(a.radius, Math.min(w - a.radius, a.x));
        a.y = Math.max(a.radius, Math.min(h - a.radius, a.y));
      }

      // Draw with zoom/pan
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(panRef.current.x, panRef.current.y);
      ctx.scale(zoomRef.current, zoomRef.current);

      // Edges
      for (const e of edges) {
        const src = nodes.find(n => n.id === e.source);
        const tgt = nodes.find(n => n.id === e.target);
        if (!src || !tgt) continue;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Sort nodes by z for 3D depth (back to front)
      const sortedNodes = [...nodes].sort((a, b) => a.z - b.z);

      // Nodes
      for (const n of sortedNodes) {
        // 3D depth: scale and opacity based on z
        const depthScale = 0.7 + (n.z + 100) / 300 * 0.6; // 0.7 to 1.3
        const depthAlpha = 0.5 + (n.z + 100) / 200 * 0.5; // 0.5 to 1.0
        const r3d = n.radius * depthScale;

        // Pulse effect
        const pulseAmt = n.pulse ? Math.max(0, 1 - (Date.now() - n.pulse) / 1500) : 0;
        const pulseScale = 1 + pulseAmt * 0.4 * Math.sin(Date.now() / 100);
        const effectiveR = r3d * pulseScale;

        if (n.type === "session") {
          // 3D shadow
          ctx.beginPath();
          for (let hi = 0; hi < 6; hi++) {
            const hAngle = (hi / 6) * Math.PI * 2 - Math.PI / 6;
            const hx = n.x + Math.cos(hAngle) * (effectiveR + 3) + 3;
            const hy = n.y + Math.sin(hAngle) * (effectiveR + 3) + 3;
            if (hi === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.fillStyle = "rgba(0,0,0,0.1)";
          ctx.fill();

          // Draw hexagon for session nodes
          ctx.beginPath();
          for (let hi = 0; hi < 6; hi++) {
            const hAngle = (hi / 6) * Math.PI * 2 - Math.PI / 6;
            const hx = n.x + Math.cos(hAngle) * effectiveR;
            const hy = n.y + Math.sin(hAngle) * effectiveR;
            if (hi === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.fillStyle = n.color;
          ctx.globalAlpha = depthAlpha * 0.9;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "rgba(0,0,0,0.15)";
          ctx.lineWidth = 2;
          ctx.stroke();

          // Student name (primary label)
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${Math.max(8, effectiveR * 0.42)}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(n.label, n.x, n.y - 3);
          // Engagement % (secondary)
          ctx.font = `${Math.max(7, effectiveR * 0.35)}px Inter, sans-serif`;
          ctx.globalAlpha = 0.8;
          ctx.fillText(`${n.value}%`, n.x, n.y + effectiveR * 0.35);
          ctx.globalAlpha = 1;
        } else {
          // Circle for metric nodes with depth + pulse
          if (pulseAmt > 0) {
            // Pulse ring
            ctx.beginPath();
            ctx.arc(n.x, n.y, effectiveR + 6 * pulseAmt, 0, Math.PI * 2);
            ctx.strokeStyle = n.color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = pulseAmt * 0.5;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
          ctx.beginPath();
          ctx.arc(n.x, n.y, effectiveR, 0, Math.PI * 2);
          ctx.fillStyle = n.color;
          ctx.globalAlpha = depthAlpha * 0.65;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "rgba(0,0,0,0.08)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Icon for metric nodes
        if (n.type === "metric" && n.icon && n.radius > 8) {
          ctx.font = `${Math.max(8, n.radius * 0.8)}px serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(n.icon, n.x, n.y);
        }
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [dimensions]);

  // Convert screen coords to graph coords
  const screenToGraph = (sx: number, sy: number) => ({
    x: (sx - panRef.current.x) / zoomRef.current,
    y: (sy - panRef.current.y) / zoomRef.current,
  });

  const findNodeAt = (sx: number, sy: number) => {
    const { x, y } = screenToGraph(sx, sy);
    for (const n of nodesRef.current) {
      const dx = n.x - x;
      const dy = n.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < n.radius + 4) return n;
    }
    return null;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Drag node
    if (dragRef.current) {
      const { x, y } = screenToGraph(sx, sy);
      const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
      if (node) { node.x = x; node.y = y; node.vx = 0; node.vy = 0; }
      return;
    }

    // Pan
    if (isPanningRef.current) {
      panRef.current.x += e.clientX - lastPanRef.current.x;
      panRef.current.y += e.clientY - lastPanRef.current.y;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    setHoveredNode(findNodeAt(sx, sy));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const node = findNodeAt(sx, sy);

    if (node) {
      dragRef.current = { nodeId: node.id, offsetX: 0, offsetY: 0 };
    } else {
      isPanningRef.current = true;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (dragRef.current) {
      const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
      if (node) {
        setClickedNode(node);
        // Pulse all same-type metric nodes
        if (node.type === "metric" && node.metricKey) {
          const key = node.metricKey;
          for (const n of nodesRef.current) {
            if (n.metricKey === key) n.pulse = Date.now();
          }
        }
      }
      dragRef.current = null;
    } else if (!isPanningRef.current) {
      // Simple click (no drag/pan) — check if we hit a node
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
        if (node) {
          setClickedNode(node);
          if (node.type === "metric" && node.metricKey) {
            for (const n of nodesRef.current) {
              if (n.metricKey === node.metricKey) n.pulse = Date.now();
            }
          }
        } else {
          setClickedNode(null);
        }
      }
    }
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.3, Math.min(3, zoomRef.current * delta));
    // Zoom toward mouse position
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      panRef.current.x = mx - (mx - panRef.current.x) * (newZoom / zoomRef.current);
      panRef.current.y = my - (my - panRef.current.y) * (newZoom / zoomRef.current);
    }
    zoomRef.current = newZoom;
  };

  return (
    <div ref={containerRef} className="graph-container">
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        style={{ width: dimensions.w, height: dimensions.h, cursor: dragRef.current ? "grabbing" : "grab" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setHoveredNode(null); dragRef.current = null; isPanningRef.current = false; }}
        onWheel={handleWheel}
      />
      {(hoveredNode || clickedNode) && (() => {
        const node = hoveredNode || clickedNode;
        if (!node) return null;
        const sx = node.x * zoomRef.current + panRef.current.x;
        const sy = node.y * zoomRef.current + panRef.current.y;
        return (
          <div className="graph-tooltip" style={{ left: Math.min(dimensions.w - 180, sx + 12), top: sy - 50 }}>
            <strong>{node.label}</strong>
            {node.value != null && <span>{node.value}{node.type === "session" ? "% engagement" : "%"}</span>}
            {node.type === "metric" && <span style={{ fontSize: "0.65rem", color: "#999" }}>Click to highlight all {node.label} nodes</span>}
          </div>
        );
      })()}
      <div className="graph-legend">
        {Object.entries(STUDENT_COLORS).map(([name, color]) => (
          <span key={name}><span className="legend-dot" style={{ background: color }} /> {name.split(" ")[0]}</span>
        ))}
        <span style={{ marginLeft: 12, borderLeft: "1px solid #ddd", paddingLeft: 12 }}><span className="legend-dot" style={{ background: "#2B86C5" }} /> Eye</span>
        <span><span className="legend-dot" style={{ background: "#8B5CF6" }} /> Talk</span>
        <span><span className="legend-dot" style={{ background: "#E8573A" }} /> Interrupts</span>
        <span><span className="legend-dot" style={{ background: "#2D9D5E" }} /> Duration</span>
      </div>
    </div>
  );
}
