import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

const C = { cyan: "#39d0d8", green: "#3fb950", red: "#f85149", amber: "#d29922", dim: "#6e7681", text: "#e6edf3", bg: "#0d1117", border: "#21262d" };

const STATS = [
  { label: "p50", value: "42ms",  color: "#3fb950", barPct: 0.14 },
  { label: "p95", value: "98ms",  color: "#d29922", barPct: 0.32 },
  { label: "p99", value: "156ms", color: "#f85149", barPct: 0.52 },
];

const StatBar: React.FC<{ stat: typeof STATS[0]; index: number; frame: number; fps: number }> = ({ stat, index, frame, fps }) => {
  const delay = 80 + index * 14;
  const opacity = interpolate(Math.max(0, frame - delay), [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const barS = spring({ frame: Math.max(0, frame - (delay + 5)), fps, config: { damping: 16, stiffness: 80, mass: 1 } });
  const barW = interpolate(barS, [0, 1], [0, stat.barPct * 100]);

  return (
    <div style={{ opacity, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 13 }}>
        <span style={{ color: C.dim }}>{stat.label}</span>
        <span style={{ color: stat.color, fontWeight: 700 }}>{stat.value}</span>
      </div>
      <div style={{ height: 6, backgroundColor: "#21262d", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${barW}%`, backgroundColor: stat.color, borderRadius: 3, boxShadow: `0 0 8px ${stat.color}88` }} />
      </div>
    </div>
  );
};

export const PerfScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const labelOpacity = interpolate(frame, [5, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Command types in
  const CMD = "$ ghostrun perf:run auth-flow --vus 50 --duration 30";
  const cmdChars = Math.floor(interpolate(frame, [10, 40], [0, CMD.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const cmdOpacity = interpolate(frame, [10, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cursorVisible = Math.floor(frame / 15) % 2 === 0;

  // VU progress bar
  const progressS = spring({ frame: Math.max(0, frame - 42), fps, config: { damping: 20, stiffness: 40, mass: 1 } });
  const progressW = interpolate(progressS, [0, 1], [0, 100]);
  const progressOpacity = interpolate(frame, [42, 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Counters
  const reqCount = Math.round(interpolate(Math.max(0, frame - 42), [0, 80], [0, 12840], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const rps = Math.round(interpolate(Math.max(0, frame - 42), [0, 80], [0, 428], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  // Right panel: stats
  const statsPanelOpacity = interpolate(frame, [78, 92], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const statsS = spring({ frame: Math.max(0, frame - 78), fps, config: { damping: 14, stiffness: 90 } });
  const statsY = interpolate(statsS, [0, 1], [24, 0]);

  // "All within SLA" badge
  const slaOpacity = interpolate(frame, [130, 142], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const slaS = spring({ frame: Math.max(0, frame - 130), fps, config: { damping: 10, stiffness: 220, mass: 0.5 } });
  const slaScale = interpolate(slaS, [0, 1], [0.6, 1]);

  const glowPulse = interpolate(Math.sin((frame / fps) * Math.PI * 2), [-1, 1], [0.3, 0.7]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#080c10", opacity: sceneOpacity }}>
      <div style={{ position: "absolute", width: 700, height: 350, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(57,208,216,0.04) 0%, transparent 70%)", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />

      {/* Label */}
      <div style={{ position: "absolute", top: 20, left: 44, opacity: labelOpacity, fontSize: 11, color: C.dim, fontFamily: "'JetBrains Mono', Menlo, monospace", letterSpacing: 2, textTransform: "uppercase" }}>
        03 / LOAD TESTING
      </div>
      <div style={{ position: "absolute", top: 20, right: 44, opacity: labelOpacity, fontSize: 11, color: C.dim, fontFamily: "'JetBrains Mono', Menlo, monospace" }}>
        50 virtual users · 30s
      </div>

      <AbsoluteFill style={{ padding: "56px 44px", flexDirection: "row", gap: 28, alignItems: "center" }}>

        {/* Left: terminal + progress */}
        <div style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Command */}
          <div style={{
            opacity: cmdOpacity, backgroundColor: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "16px 20px",
          }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#ff5f57" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#ffbd2e" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#28ca41" }} />
              <span style={{ marginLeft: 8, color: C.dim, fontSize: 10, fontFamily: "'JetBrains Mono', Menlo, monospace" }}>ghostrun — zsh</span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 12, color: C.text }}>
              {CMD.slice(0, cmdChars)}
              {cmdChars < CMD.length && cursorVisible && (
                <span style={{ display: "inline-block", width: 6, height: "0.85em", backgroundColor: C.cyan, marginLeft: 1, verticalAlign: "text-bottom", borderRadius: 1 }} />
              )}
            </div>
          </div>

          {/* Progress */}
          {frame >= 42 && (
            <div style={{ opacity: progressOpacity, backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 12 }}>
                <span style={{ color: C.cyan }}>⚡ Running load test...</span>
                <span style={{ color: C.dim }}>{Math.round(progressW)}%</span>
              </div>
              <div style={{ height: 8, backgroundColor: "#161b22", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progressW}%`, background: `linear-gradient(90deg, #39d0d8, #3fb950)`, borderRadius: 4, boxShadow: "0 0 12px rgba(57,208,216,0.4)" }} />
              </div>
              <div style={{ display: "flex", gap: 32, marginTop: 12, fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 12 }}>
                <div>
                  <span style={{ color: C.dim }}>Requests  </span>
                  <span style={{ color: C.text, fontWeight: 700 }}>{reqCount.toLocaleString()}</span>
                </div>
                <div>
                  <span style={{ color: C.dim }}>RPS  </span>
                  <span style={{ color: C.cyan, fontWeight: 700 }}>{rps}</span>
                </div>
                <div>
                  <span style={{ color: C.dim }}>Success  </span>
                  <span style={{ color: C.green, fontWeight: 700 }}>100%</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: latency stats */}
        <div style={{
          flex: 1, opacity: statsPanelOpacity, transform: `translateY(${statsY}px)`,
          backgroundColor: C.bg, border: `1px solid rgba(57,208,216,0.2)`,
          borderRadius: 12, padding: "24px",
          boxShadow: `0 0 40px rgba(57,208,216,${glowPulse * 0.15})`,
          display: "flex", flexDirection: "column", gap: 20,
        }}>
          <div style={{ fontSize: 11, color: C.dim, fontFamily: "'JetBrains Mono', Menlo, monospace", letterSpacing: 1.5, textTransform: "uppercase" }}>
            Latency Breakdown
          </div>

          {STATS.map((stat, i) => (
            <StatBar key={stat.label} stat={stat} index={i} frame={frame} fps={fps} />
          ))}

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { label: "min", val: "18ms" },
              { label: "max", val: "204ms" },
              { label: "avg RPS", val: "428" },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 12 }}>
                <span style={{ color: C.dim }}>{item.label}</span>
                <span style={{ color: C.text }}>{item.val}</span>
              </div>
            ))}
          </div>

          {/* SLA badge */}
          {frame >= 130 && (
            <div style={{
              opacity: slaOpacity, transform: `scale(${slaScale})`,
              display: "flex", alignItems: "center", gap: 8,
              backgroundColor: "rgba(63,185,80,0.1)", border: "1px solid rgba(63,185,80,0.35)",
              borderRadius: 8, padding: "8px 14px",
            }}>
              <span style={{ color: C.green, fontSize: 14 }}>✓</span>
              <span style={{ color: C.green, fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 12, fontWeight: 700 }}>
                p99 &lt; 200ms — within SLA
              </span>
            </div>
          )}
        </div>

      </AbsoluteFill>
    </AbsoluteFill>
  );
};
