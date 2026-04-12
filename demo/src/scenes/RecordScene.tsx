import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";
import { BrowserMock, LoginFormMock } from "../components/BrowserMock";

// Each line config: text, color key, and which frame offset to start appearing
const RECORD_LINES: {
  text: string;
  color: string;
  startFrame: number;
  bold?: boolean;
}[] = [
  { text: "$ node flowmind.js learn https://app.example.com", color: "#e6edf3", startFrame: 0 },
  { text: "", color: "#e6edf3", startFrame: 18 },
  { text: "  RECORDING  👤 human flow — browser is live", color: "#00d4ff", startFrame: 20, bold: true },
  { text: "", color: "#e6edf3", startFrame: 30 },
  { text: "  🌐 navigate → https://app.example.com", color: "#8b949e", startFrame: 32 },
  { text: "  🖱  click \"Login\"", color: "#8b949e", startFrame: 42 },
  { text: "  ⌨️  fill #email = \"user@example.com\"", color: "#8b949e", startFrame: 53 },
  { text: "  ⌨️  fill #password = \"••••••••\"", color: "#8b949e", startFrame: 66 },
  { text: "  🖱  click \"Sign in\"", color: "#8b949e", startFrame: 78 },
  { text: "  ✅ assert text: Dashboard", color: "#3fb950", startFrame: 89 },
];

// Characters typed per frame
const CPF = 4;

function useTypedLines(frame: number) {
  return RECORD_LINES.map((line) => {
    if (frame < line.startFrame) return null;
    if (line.text === "") return { text: "", color: line.color, bold: line.bold };
    const elapsed = frame - line.startFrame;
    const chars = Math.min(line.text.length, elapsed * CPF);
    return { text: line.text.slice(0, chars), color: line.color, bold: line.bold };
  }).filter(Boolean) as { text: string; color: string; bold?: boolean }[];
}

// Determine browser state from frame
function getBrowserState(frame: number): {
  highlight: "email" | "password" | "button" | null;
  showDash: boolean;
} {
  if (frame >= 89) return { highlight: null, showDash: true };
  if (frame >= 78) return { highlight: "button", showDash: false };
  if (frame >= 66) return { highlight: "password", showDash: false };
  if (frame >= 53) return { highlight: "email", showDash: false };
  return { highlight: null, showDash: false };
}

export const RecordScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideIn = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 100 },
  });

  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const translateX = interpolate(slideIn, [0, 1], [-30, 0]);

  const typedLines = useTypedLines(frame);
  const { highlight, showDash } = getBrowserState(frame);

  // Recording indicator pulse
  const recPulse = Math.sin((frame / fps) * Math.PI * 3) * 0.3 + 0.7;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0d1117",
        padding: 40,
        flexDirection: "row",
        gap: 24,
        alignItems: "center",
        opacity,
      }}
    >
      {/* Scene label */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 40,
          fontSize: 11,
          color: "#6e7681",
          fontFamily: "Menlo, Consolas, monospace",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        01 / RECORD
      </div>

      {/* Recording dot */}
      <div
        style={{
          position: "absolute",
          top: 14,
          right: 40,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "#f85149",
            opacity: recPulse,
            boxShadow: `0 0 8px rgba(248, 81, 73, ${recPulse * 0.8})`,
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: "#f85149",
            fontFamily: "Menlo, monospace",
            letterSpacing: 0.5,
          }}
        >
          REC
        </span>
      </div>

      {/* Terminal panel */}
      <div
        style={{
          flex: 1,
          transform: `translateX(${translateX}px)`,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            backgroundColor: "#161b22",
            borderRadius: 10,
            padding: "20px 24px",
            border: "1px solid #30363d",
            height: 520,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Terminal chrome */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#ff5f57" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#ffbd2e" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#28ca41" }} />
            <span style={{ marginLeft: 8, color: "#6e7681", fontSize: 11, fontFamily: "Menlo, monospace" }}>
              flowmind — zsh
            </span>
          </div>

          {/* Lines */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {typedLines.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line.color,
                  fontFamily: "Menlo, Consolas, 'Courier New', monospace",
                  fontSize: 12.5,
                  lineHeight: 1.75,
                  fontWeight: line.bold ? 600 : 400,
                  minHeight: "1.75em",
                  whiteSpace: "pre",
                }}
              >
                {line.text}
                {/* Cursor on last line that's still typing */}
                {i === typedLines.length - 1 &&
                  line.text.length < RECORD_LINES.filter((l) => frame >= l.startFrame).slice(-1)[0]?.text.length && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 7,
                        height: "0.9em",
                        backgroundColor: "#00d4ff",
                        marginLeft: 1,
                        verticalAlign: "text-bottom",
                        opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0,
                      }}
                    />
                  )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Browser panel */}
      <div
        style={{
          flex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          opacity: interpolate(frame, [5, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <BrowserMock
          url="https://app.example.com"
          style={{ height: 520 }}
        >
          <LoginFormMock highlightField={highlight} showDashboard={showDash} />
        </BrowserMock>
      </div>
    </AbsoluteFill>
  );
};
