import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";

interface AILine {
  text: string;
  color: string;
  startFrame: number;
  bold?: boolean;
  bgHighlight?: boolean;
}

const AI_LINES: AILine[] = [
  { text: "$ node flowmind.js run checkout", color: "#e6edf3", startFrame: 0 },
  { text: "", color: "#e6edf3", startFrame: 16 },
  { text: "  Running: Checkout Flow  👤", color: "#e6edf3", startFrame: 18, bold: true },
  { text: "", color: "#e6edf3", startFrame: 30 },
  // Failure line - will get red highlight
  { text: "  ✗ Step 4 failed: Element not found", color: "#f85149", startFrame: 32, bold: true, bgHighlight: true },
  { text: "    └─ selector: #cart-button", color: "#f85149", startFrame: 46 },
  { text: "", color: "#e6edf3", startFrame: 56 },
  // AI analysis section - types in amber
  { text: "  FAILURE REPORT", color: "#d29922", startFrame: 58, bold: true },
  { text: "", color: "#e6edf3", startFrame: 68 },
  { text: "  WHAT FAILED", color: "#d29922", startFrame: 70, bold: true },
  { text: "    Cart button (#cart-button) not found", color: "#e6edf3", startFrame: 76 },
  { text: "", color: "#e6edf3", startFrame: 88 },
  { text: "  WHY IT FAILED", color: "#d29922", startFrame: 90, bold: true },
  { text: "    The shopping cart icon was redesigned and", color: "#e6edf3", startFrame: 96 },
  { text: "    the selector changed to .header-cart", color: "#e6edf3", startFrame: 110 },
  { text: "", color: "#e6edf3", startFrame: 124 },
  { text: "  HOW TO FIX IT", color: "#d29922", startFrame: 126, bold: true },
  { text: "    Run: node flowmind.js flow:fix checkout", color: "#00d4ff", startFrame: 132 },
];

const CPF = 3.5;

export const AIScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const slideIn = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 100 },
  });

  const translateX = interpolate(slideIn, [0, 1], [20, 0]);

  // Compute visible text for each line
  const renderedLines = AI_LINES.map((line) => {
    if (frame < line.startFrame) return null;
    if (line.text === "") {
      return { text: "", color: line.color, bold: line.bold, bgHighlight: line.bgHighlight };
    }
    const elapsed = frame - line.startFrame;
    const chars = Math.min(line.text.length, elapsed * CPF);
    return {
      text: line.text.slice(0, chars),
      color: line.color,
      bold: line.bold,
      bgHighlight: line.bgHighlight,
      typing: chars < line.text.length,
    };
  }).filter(Boolean) as {
    text: string;
    color: string;
    bold?: boolean;
    bgHighlight?: boolean;
    typing?: boolean;
  }[];

  // AI analysis glow - starts when AI lines appear
  const aiGlow = interpolate(frame, [58, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0d1117",
        padding: 40,
        alignItems: "center",
        justifyContent: "center",
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
        03 / AI ANALYSIS
      </div>

      {/* AI indicator */}
      {frame >= 58 && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 40,
            display: "flex",
            alignItems: "center",
            gap: 8,
            opacity: aiGlow,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "#d29922",
              boxShadow: `0 0 12px rgba(210, 153, 34, 0.8)`,
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: "#d29922",
              fontFamily: "Menlo, monospace",
              letterSpacing: 0.5,
            }}
          >
            AI ANALYZING
          </span>
        </div>
      )}

      {/* Ambient glow for AI section */}
      {frame >= 58 && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 300,
            background: `linear-gradient(to top, rgba(210, 153, 34, ${0.04 * aiGlow}), transparent)`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Wide terminal for this scene */}
      <div
        style={{
          width: "100%",
          maxWidth: 820,
          transform: `translateX(${translateX}px)`,
        }}
      >
        <div
          style={{
            backgroundColor: "#161b22",
            borderRadius: 10,
            padding: "20px 28px",
            border: "1px solid #30363d",
            minHeight: 580,
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

          <div
            style={{
              fontFamily: "Menlo, Consolas, 'Courier New', monospace",
              fontSize: 13,
              lineHeight: 1.75,
            }}
          >
            {renderedLines.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line.color,
                  fontWeight: line.bold ? 700 : 400,
                  minHeight: "1.75em",
                  whiteSpace: "pre",
                  backgroundColor: line.bgHighlight ? "rgba(248, 81, 73, 0.12)" : "transparent",
                  borderLeft: line.bgHighlight ? "3px solid #f85149" : "3px solid transparent",
                  paddingLeft: line.bgHighlight ? 6 : 0,
                  marginLeft: line.bgHighlight ? -9 : 0,
                  borderRadius: line.bgHighlight ? 2 : 0,
                }}
              >
                {line.text}
                {/* Blinking cursor */}
                {line.typing && i === renderedLines.length - 1 && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 7,
                      height: "0.9em",
                      backgroundColor: line.color,
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
    </AbsoluteFill>
  );
};
