"use client";

import { useCallback, useMemo, useRef, useEffect } from "react";
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

export function SessionGraph3D({ sessions }: { sessions: SessionNode[] }) {
  const fgRef = useRef<any>(null);

  const graphData = useMemo(() => {
    const nodes: any[] = [];
    const links: any[] = [];

    // Session nodes
    sessions.forEach((s) => {
      nodes.push({
        id: s.id,
        name: s.student.split(" ")[0],
        fullName: s.student,
        subject: s.subject,
        val: 8 + (s.duration / 10),
        color: STUDENT_COLORS[s.student] || "#888",
        type: "session",
        engagement: s.engagement,
        date: s.date,
        duration: s.duration,
      });

      // Metric nodes
      const metrics = [
        { key: "eye", label: "Eye Contact", value: s.eyeContact, icon: "👁" },
        { key: "talk", label: "Talk Balance", value: s.talkBalance, icon: "🗣" },
        { key: "int", label: "Interruptions", value: Math.min(100, s.interruptions * 20), icon: "⚡" },
        { key: "dur", label: "Duration", value: Math.min(100, s.duration * 2), icon: "⏱" },
      ];

      metrics.forEach((m) => {
        const mId = `${s.id}-${m.key}`;
        nodes.push({
          id: mId,
          name: m.label,
          val: 2 + (m.value / 25),
          color: METRIC_COLORS[m.key],
          type: "metric",
          metricKey: m.key,
          metricValue: m.value,
          icon: m.icon,
          parentId: s.id,
        });
        links.push({ source: s.id, target: mId, color: METRIC_COLORS[m.key] + "40" });
      });
    });

    // Connect same-student sessions
    const studentSessions: Record<string, string[]> = {};
    sessions.forEach((s) => {
      if (!studentSessions[s.student]) studentSessions[s.student] = [];
      studentSessions[s.student].push(s.id);
    });
    Object.values(studentSessions).forEach((ids) => {
      for (let i = 1; i < ids.length; i++) {
        links.push({ source: ids[i - 1], target: ids[i], color: "#00000020" });
      }
    });

    // Connect same-type metrics
    const metricGroups: Record<string, string[]> = {};
    nodes.filter((n) => n.type === "metric").forEach((n) => {
      if (!metricGroups[n.metricKey]) metricGroups[n.metricKey] = [];
      metricGroups[n.metricKey].push(n.id);
    });
    Object.entries(metricGroups).forEach(([key, ids]) => {
      for (let i = 1; i < ids.length; i++) {
        links.push({ source: ids[i - 1], target: ids[i], color: (METRIC_COLORS[key] || "#888") + "15" });
      }
    });

    return { nodes, links };
  }, [sessions]);

  // Auto-rotate
  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force("charge")?.strength(-80);
      fgRef.current.d3Force("link")?.distance((link: any) => {
        const src = graphData.nodes.find((n: any) => n.id === link.source?.id || n.id === link.source);
        const tgt = graphData.nodes.find((n: any) => n.id === link.target?.id || n.id === link.target);
        if (src?.type === "metric" || tgt?.type === "metric") return 30;
        return 60;
      });
    }
  }, [graphData]);

  const nodeThreeObject = useCallback((node: any) => {
    // Use Three.js to create custom 3D objects
    const THREE = require("three");

    if (node.type === "session") {
      // Dodecahedron (looks hex-ish in 3D) for sessions
      const geometry = new THREE.DodecahedronGeometry(node.val, 0);
      const material = new THREE.MeshPhongMaterial({
        color: node.color,
        transparent: true,
        opacity: 0.9,
        shininess: 60,
      });
      const mesh = new THREE.Mesh(geometry, material);

      // Add text sprite
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "white";
        ctx.font = "bold 24px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(node.name, 64, 28);
        ctx.font = "18px Inter, sans-serif";
        ctx.fillText(`${node.engagement}%`, 64, 52);
      }
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(16, 8, 1);
      sprite.position.y = node.val + 4;

      const group = new THREE.Group();
      group.add(mesh);
      group.add(sprite);
      return group;
    } else {
      // Small sphere for metrics
      const geometry = new THREE.SphereGeometry(node.val, 12, 12);
      const material = new THREE.MeshPhongMaterial({
        color: node.color,
        transparent: true,
        opacity: 0.7,
        shininess: 40,
      });
      return new THREE.Mesh(geometry, material);
    }
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    if (fgRef.current && node) {
      // Focus camera on clicked node
      const distance = 80;
      const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
      fgRef.current.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
        node,
        1000
      );
    }
  }, []);

  return (
    <div className="graph-3d-container">
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        nodeThreeObject={nodeThreeObject}
        nodeLabel={(node: any) =>
          node.type === "session"
            ? `<div style="background:rgba(0,0,0,0.85);color:white;padding:8px 12px;border-radius:8px;font-size:13px;max-width:200px">
                <strong>${node.fullName}</strong><br/>
                ${node.subject} · ${node.date}<br/>
                Engagement: ${node.engagement}%<br/>
                Duration: ${node.duration}min
              </div>`
            : `<div style="background:rgba(0,0,0,0.85);color:white;padding:6px 10px;border-radius:6px;font-size:12px">
                ${node.name}: ${node.metricValue}%
              </div>`
        }
        linkColor={(link: any) => link.color}
        linkWidth={0.5}
        linkOpacity={0.3}
        backgroundColor="#F0E8E0"
        width={undefined}
        height={500}
        onNodeClick={handleNodeClick}
        enableNodeDrag
        enableNavigationControls
        showNavInfo={false}
      />
      <div className="graph-legend" style={{ position: "relative", zIndex: 10, marginTop: -8 }}>
        {Object.entries(STUDENT_COLORS).map(([name, color]) => (
          <span key={name}><span className="legend-dot" style={{ background: color }} /> {name.split(" ")[0]}</span>
        ))}
        <span style={{ marginLeft: 12, borderLeft: "1px solid #ddd", paddingLeft: 12 }}>
          <span className="legend-dot" style={{ background: "#2B86C5" }} /> Eye
        </span>
        <span><span className="legend-dot" style={{ background: "#8B5CF6" }} /> Talk</span>
        <span><span className="legend-dot" style={{ background: "#E8573A" }} /> Interrupts</span>
      </div>
    </div>
  );
}
