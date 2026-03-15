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
  vx: number;
  vy: number;
  radius: number;
  color: string;
  type: "session" | "metric";
  value?: number;
  icon?: string;
  parentId?: string;
}

interface GraphEdge {
  source: string;
  target: string;
  color: string;
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
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });
  const containerRef = useRef<HTMLDivElement>(null);

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
        x, y, vx: 0, vy: 0,
        radius: size,
        color: engColor(s.engagement),
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
          vx: 0, vy: 0,
          radius: 6 + (m.value / 100) * 8,
          color: metricColor(m.key),
          type: "metric",
          value: m.value,
          icon: m.icon,
          parentId: s.id,
        });
        edges.push({ source: s.id, target: mId, color: metricColor(m.key) });
      });

      // Connect sequential sessions
      if (i > 0) {
        edges.push({
          source: sessions[i - 1].id,
          target: s.id,
          color: "rgba(0,0,0,0.08)",
        });
      }
    });

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

      // Draw
      ctx.clearRect(0, 0, w, h);

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

      // Nodes
      for (const n of nodes) {
        if (n.type === "session") {
          // Draw hexagon for session nodes
          ctx.beginPath();
          for (let hi = 0; hi < 6; hi++) {
            const hAngle = (hi / 6) * Math.PI * 2 - Math.PI / 6;
            const hx = n.x + Math.cos(hAngle) * n.radius;
            const hy = n.y + Math.sin(hAngle) * n.radius;
            if (hi === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.fillStyle = n.color;
          ctx.globalAlpha = 0.88;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "rgba(0,0,0,0.15)";
          ctx.lineWidth = 2;
          ctx.stroke();

          // Student name (primary label)
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${Math.max(8, n.radius * 0.42)}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(n.label, n.x, n.y - 3);
          // Engagement % (secondary)
          ctx.font = `${Math.max(7, n.radius * 0.35)}px Inter, sans-serif`;
          ctx.globalAlpha = 0.8;
          ctx.fillText(`${n.value}%`, n.x, n.y + n.radius * 0.35);
          ctx.globalAlpha = 1;
        } else {
          // Circle for metric nodes
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
          ctx.fillStyle = n.color;
          ctx.globalAlpha = 0.6;
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

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [dimensions]);

  // Mouse hover
  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const nodes = nodesRef.current;
    let found: GraphNode | null = null;
    for (const n of nodes) {
      const dx = n.x - x;
      const dy = n.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < n.radius + 4) {
        found = n;
        break;
      }
    }
    setHoveredNode(found);
  };

  return (
    <div ref={containerRef} className="graph-container">
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        style={{ width: dimensions.w, height: dimensions.h }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredNode(null)}
      />
      {hoveredNode && (
        <div className="graph-tooltip" style={{
          left: Math.min(dimensions.w - 160, hoveredNode.x + 12),
          top: hoveredNode.y - 40,
        }}>
          <strong>{hoveredNode.label}</strong>
          {hoveredNode.value != null && <span>{hoveredNode.value}{hoveredNode.type === "session" ? "% engagement" : "%"}</span>}
        </div>
      )}
      <div className="graph-legend">
        <span><span className="legend-dot" style={{ background: "#2D9D5E" }} /> High engagement</span>
        <span><span className="legend-dot" style={{ background: "#E8873A" }} /> Moderate</span>
        <span><span className="legend-dot" style={{ background: "#C4402F" }} /> Low</span>
        <span><span className="legend-dot" style={{ background: "#2B86C5" }} /> Eye contact</span>
        <span><span className="legend-dot" style={{ background: "#8B5CF6" }} /> Talk balance</span>
        <span><span className="legend-dot" style={{ background: "#E8573A" }} /> Interruptions</span>
      </div>
    </div>
  );
}
