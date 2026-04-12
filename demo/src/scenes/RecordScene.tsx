import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Img,
  staticFile,
} from "remotion";

const RECORD_LINES: {
  text: string;
  color: string;
  startFrame: number;
  bold?: boolean;
}[] = [
  { text: "$ ghostrun learn https://myapp.com login-flow", color: "#e6edf3", startFrame: 10 },
  { text: "", color: "#e6edf3", startFrame: 30 },
  { text: "  👤  RECORDING  —  browser is live", color: "#39d0d8", startFrame: 32, bold: true },
  { text: "", color: "#e6edf3", startFrame: 42 },
  { text: "  🌐  navigate → https://myapp.com/login", color: "#8b949e", startFrame: 44 },
  { text: "  🖱   click \"Login\" button", color: "#8b949e", startFrame: 56 },
  { text: "  ⌨️   fill #email = \"user@myapp.com\"", color: "#8b949e", startFrame: 70 },
  { text: "  ⌨️   fill #password = \"••••••••\"", color: "#8b949e", startFrame: 84 },
  { text: "  🖱   click \"Sign In\"", color: "#8b949e", startFrame: 98 },
  { text: "  ✅  assert: redirected to /dashboard", color: "#3fb950", startFrame: 115 },
  { text: "", color: "#e6edf3", startFrame: 125 },
  { text: "  ✓ Flow saved! → login-flow (6 steps)", color: "#3fb950", startFrame: 127, bold: true },
];

const CPF = 5;

function useTypedLines(frame: number) {
  return RECORD_LINES.map((line) => {
    if (frame < line.startFrame) return null;
    if (line.text === "") return { text: "", color: line.color, bold: line.bold };
    const elapsed = frame - line.startFrame;
    const chars = Math.min(line.text.length, elapsed * CPF);
    return { text: line.text.slice(0, chars), color: line.color, bold: line.bold };
  }).filter(Boolean) as { text: string; color: string; bold?: boolean }[];
}

export const RecordScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideIn = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 100 },
  });

  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const translateX = interpolate(slideIn, [0, 1], [-30, 0]);

  const typedLines = useTypedLines(frame);

  // Recording indicator pulse
  const recPulse = Math.sin((frame / fps) * Math.PI * 3) * 0.3 + 0.7;

  // Help screenshot slides in on right side
  const screenshotOpacity = interpolate(frame, [8, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const screenshotX = interpolate(slideIn, [0, 1], [30, 0]);

  // Saved badge
  const savedOpacity = interpolate(frame, [128, 148], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const savedScale = spring({
    frame: Math.max(0, frame - 128),
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.6 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#080c10",
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
          fontFamily: "'JetBrains Mono', Menlo, monospace",
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        01 / RECORD
      </div>

      {/* Recording indicator */}
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
            boxShadow: `0 0 10px rgba(248, 81, 73, ${recPulse * 0.9})`,
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: "#f85149",
            fontFamily: "'JetBrains Mono', Menlo, monospace",
            letterSpacing: 1,
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
            backgroundColor: "#0d1117",
            borderRadius: 12,
            padding: "20px 24px",
            border: "1px solid #21262d",
            height: 540,
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 0 40px rgba(57,208,216,0.06), 0 20px 40px rgba(0,0,0,0.5)",
          }}
        >
          {/* Terminal chrome */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#ff5f57" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#ffbd2e" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#28ca41" }} />
            <span
              style={{
                marginLeft: 8,
                color: "#6e7681",
                fontSize: 11,
                fontFamily: "'JetBrains Mono', Menlo, monospace",
              }}
            >
              ghostrun — zsh
            </span>
          </div>

          {/* Lines */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {typedLines.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line.color,
                  fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
                  fontSize: 12.5,
                  lineHeight: 1.8,
                  fontWeight: line.bold ? 700 : 400,
                  minHeight: "1.8em",
                  whiteSpace: "pre",
                }}
              >
                {line.text}
                {i === typedLines.length - 1 &&
                  line.text.length <
                    RECORD_LINES.filter((l) => frame >= l.startFrame).slice(-1)[0]?.text.length && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 7,
                        height: "0.9em",
                        backgroundColor: "#39d0d8",
                        marginLeft: 1,
                        verticalAlign: "text-bottom",
                        borderRadius: 1,
                        opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0,
                      }}
                    />
                  )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel: help screenshot + saved badge */}
      <div
        style={{
          flex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 20,
          opacity: screenshotOpacity,
          transform: `translateX(${screenshotX}px)`,
        }}
      >
        <div
          style={{
            borderRadius: 10,
            overflow: "hidden",
            border: "1px solid #21262d",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            width: "100%",
          }}
        >
          <Img
            src={staticFile("screen-help.png")}
            style={{ width: "100%", display: "block" }}
          />
        </div>

        {/* Saved badge */}
        {frame >= 127 && (
          <div
            style={{
              opacity: savedOpacity,
              transform: `scale(${interpolate(savedScale, [0, 1], [0.7, 1])})`,
              backgroundColor: "rgba(63, 185, 80, 0.12)",
              border: "1px solid rgba(63, 185, 80, 0.4)",
              borderRadius: 24,
              padding: "10px 24px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 0 20px rgba(63, 185, 80, 0.2)",
            }}
          >
            <span style={{ fontSize: 18, color: "#3fb950" }}>✓</span>
            <span
              style={{
                color: "#3fb950",
                fontFamily: "'JetBrains Mono', Menlo, monospace",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Flow saved!
            </span>
            <span style={{ color: "#6e7681", fontSize: 12 }}>6 steps recorded</span>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
