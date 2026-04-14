import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

const C = { cyan: "#39d0d8", green: "#3fb950", dim: "#6e7681", text: "#e6edf3", bg: "#0d1117", border: "#21262d" };

const MCP_TOOLS = ["list_flows", "run_flow", "get_run_result", "get_status"];

const CONVERSATION = [
  { role: "user", text: "Run my login flow and tell me if it passed.", delay: 10 },
  { role: "tool", text: '🔧 run_flow({ flowId: "login-flow" })', delay: 40 },
  { role: "result", text: '✓ passed · 5 steps · 1.2s · 0 failures', delay: 68 },
  { role: "assistant", text: "Your login flow passed! All 5 steps completed successfully in 1.2 seconds.", delay: 90 },
];

const Message: React.FC<{ msg: typeof CONVERSATION[0]; frame: number; fps: number }> = ({ msg, frame, fps }) => {
  const s = spring({ frame: Math.max(0, frame - msg.delay), fps, config: { damping: 14, stiffness: 100 } });
  const opacity = interpolate(Math.max(0, frame - msg.delay), [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(s, [0, 1], [10, 0]);

  const isUser = msg.role === "user";
  const isTool = msg.role === "tool";
  const isResult = msg.role === "result";

  return (
    <div style={{
      opacity, transform: `translateY(${y}px)`,
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: 10,
    }}>
      <div style={{
        maxWidth: "80%",
        backgroundColor: isUser ? "rgba(57,208,216,0.12)" : isTool ? "rgba(210,153,34,0.08)" : isResult ? "rgba(63,185,80,0.08)" : "#161b22",
        border: `1px solid ${isUser ? "rgba(57,208,216,0.3)" : isTool ? "rgba(210,153,34,0.25)" : isResult ? "rgba(63,185,80,0.25)" : C.border}`,
        borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
        padding: "8px 14px",
        fontFamily: isTool || isResult ? "'JetBrains Mono', Menlo, monospace" : "system-ui, sans-serif",
        fontSize: isTool || isResult ? 12 : 13,
        color: isUser ? C.cyan : isTool ? "#d29922" : isResult ? C.green : C.text,
        lineHeight: 1.5,
      }}>
        {msg.text}
      </div>
    </div>
  );
};

export const McpScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glowPulse = interpolate(Math.sin((frame / fps) * Math.PI * 2), [-1, 1], [0.3, 0.7]);

  const leftOpacity = interpolate(frame, [5, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const leftS = spring({ frame: Math.max(0, frame - 5), fps, config: { damping: 14, stiffness: 80 } });
  const leftX = interpolate(leftS, [0, 1], [-20, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#080c10", opacity: sceneOpacity }}>
      <div style={{ position: "absolute", width: 700, height: 350, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(57,208,216,0.04) 0%, transparent 70%)", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />

      <AbsoluteFill style={{ padding: "40px 44px", flexDirection: "row", gap: 28, alignItems: "center" }}>

        {/* Left: MCP tools list */}
        <div style={{ flex: 1, opacity: leftOpacity, transform: `translateX(${leftX}px)`, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 11, color: C.dim, fontFamily: "'JetBrains Mono', Menlo, monospace", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
            MCP Server
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, fontFamily: "system-ui, sans-serif", lineHeight: 1.2 }}>
            Works inside Claude,{" "}
            <span style={{ color: C.cyan, textShadow: `0 0 20px rgba(57,208,216,${glowPulse * 0.5})` }}>Cursor</span>,
            {" "}and any AI agent
          </div>
          <div style={{ fontSize: 14, color: C.dim, fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
            GhostRun exposes 7 MCP tools — let your AI assistant run and inspect flows directly.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {MCP_TOOLS.map((tool, i) => {
              const toolOpacity = interpolate(Math.max(0, frame - (20 + i * 10)), [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return (
                <div key={tool} style={{
                  opacity: toolOpacity,
                  display: "flex", alignItems: "center", gap: 10,
                  backgroundColor: "rgba(57,208,216,0.05)", border: "1px solid rgba(57,208,216,0.15)",
                  borderRadius: 6, padding: "6px 12px",
                  fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 12, color: C.cyan,
                }}>
                  <span style={{ color: C.dim }}>fn</span>
                  {tool}
                </div>
              );
            })}
            <div style={{
              opacity: interpolate(Math.max(0, frame - 60), [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              fontSize: 11, color: C.dim, fontFamily: "'JetBrains Mono', Menlo, monospace", paddingLeft: 4,
            }}>
              + delete_flow, list_runs
            </div>
          </div>
        </div>

        {/* Right: chat conversation */}
        <div style={{
          flex: 1.1,
          backgroundColor: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: "16px 18px",
          boxShadow: `0 0 40px rgba(57,208,216,${glowPulse * 0.12})`,
          display: "flex", flexDirection: "column",
        }}>
          {/* Chat header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "rgba(57,208,216,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🤖</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "system-ui, sans-serif" }}>Claude</div>
              <div style={{ fontSize: 10, color: C.green, fontFamily: "system-ui, sans-serif" }}>● GhostRun MCP connected</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {CONVERSATION.map((msg, i) => (
              frame >= msg.delay && <Message key={i} msg={msg} frame={frame} fps={fps} />
            ))}
          </div>
        </div>

      </AbsoluteFill>
    </AbsoluteFill>
  );
};
