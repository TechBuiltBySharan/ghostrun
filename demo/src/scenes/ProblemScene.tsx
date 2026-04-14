import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

const TOOLS = [
  { name: "Playwright", role: "Browser Testing", color: "#2da44e", icon: "🌐" },
  { name: "Postman", role: "API Testing", color: "#ef5b25", icon: "📬" },
  { name: "k6", role: "Load Testing", color: "#7c3aed", icon: "⚡" },
];

const ToolCard: React.FC<{ tool: typeof TOOLS[0]; index: number; frame: number; fps: number }> = ({ tool, index, frame, fps }) => {
  const delay = index * 12;
  const s = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 14, stiffness: 100 } });
  const opacity = interpolate(Math.max(0, frame - delay), [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(s, [0, 1], [30, 0]);
  return (
    <div style={{
      opacity, transform: `translateY(${y}px)`,
      backgroundColor: "#0d1117", border: `1px solid ${tool.color}44`,
      borderRadius: 12, padding: "20px 28px",
      display: "flex", flexDirection: "column", gap: 8, width: 200,
      boxShadow: `0 0 30px ${tool.color}18`,
    }}>
      <span style={{ fontSize: 28 }}>{tool.icon}</span>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#e6edf3", fontFamily: "system-ui, sans-serif" }}>{tool.name}</div>
      <div style={{ fontSize: 12, color: "#6e7681", fontFamily: "system-ui, sans-serif" }}>{tool.role}</div>
    </div>
  );
};

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sceneOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const labelOpacity = interpolate(frame, [8, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const orOpacity = interpolate(frame, [55, 68], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const oneS = spring({ frame: Math.max(0, frame - 65), fps, config: { damping: 12, stiffness: 120, mass: 0.8 } });
  const oneScale = interpolate(oneS, [0, 1], [0.7, 1]);
  const oneOpacity = interpolate(Math.max(0, frame - 65), [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glowPulse = interpolate(Math.sin((frame / fps) * Math.PI * 2), [-1, 1], [0.3, 0.8]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#080c10", opacity: sceneOpacity }}>
      <div style={{ position: "absolute", width: 800, height: 400, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(57,208,216,0.05) 0%, transparent 70%)", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 36 }}>
        <div style={{ opacity: labelOpacity, fontSize: 15, color: "#6e7681", fontFamily: "'JetBrains Mono', Menlo, monospace", letterSpacing: 2, textTransform: "uppercase" }}>
          Most teams use three separate tools
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          {TOOLS.map((tool, i) => <ToolCard key={tool.name} tool={tool} index={i} frame={frame} fps={fps} />)}
        </div>
        <div style={{ opacity: orOpacity, display: "flex", alignItems: "center", gap: 20, width: 640 }}>
          <div style={{ flex: 1, height: 1, backgroundColor: "#21262d" }} />
          <span style={{ color: "#8b949e", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>Three configs. Three CI steps. Three ways to break.</span>
          <div style={{ flex: 1, height: 1, backgroundColor: "#21262d" }} />
        </div>
        <div style={{
          opacity: oneOpacity, transform: `scale(${oneScale})`,
          backgroundColor: "#0d1117", border: "1px solid rgba(57,208,216,0.4)",
          borderRadius: 16, padding: "20px 40px",
          display: "flex", alignItems: "center", gap: 16,
          boxShadow: `0 0 40px rgba(57,208,216,${glowPulse * 0.25}), 0 0 80px rgba(57,208,216,0.08)`,
        }}>
          <span style={{ fontSize: 28 }}>👻</span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#39d0d8", fontFamily: "'JetBrains Mono', Menlo, monospace", textShadow: `0 0 20px rgba(57,208,216,${glowPulse * 0.6})` }}>GhostRun</div>
            <div style={{ fontSize: 13, color: "#8b949e", fontFamily: "system-ui, sans-serif", marginTop: 3 }}>Browser · API · Load testing — one CLI</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
