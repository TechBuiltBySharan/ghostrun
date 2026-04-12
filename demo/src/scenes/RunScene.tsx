import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";
import { ScreenshotCard } from "../components/ScreenshotCard";

interface RunStep {
  num: number;
  label: string;
  ms: number;
  startFrame: number;
}

const RUN_STEPS: RunStep[] = [
  { num: 1, label: 'Navigate to app', ms: 68, startFrame: 25 },
  { num: 2, label: 'Click "Login"', ms: 45, startFrame: 38 },
  { num: 3, label: 'Fill email', ms: 12, startFrame: 51 },
  { num: 4, label: 'Fill password', ms: 11, startFrame: 62 },
  { num: 5, label: 'Click "Sign in"', ms: 890, startFrame: 73 },
  { num: 6, label: 'Assert: Dashboard', ms: 34, startFrame: 90 },
];

const SEPARATOR = "  ──────────────────────────────────";

const CheckMark: React.FC<{ startFrame: number; frame: number }> = ({
  startFrame,
  frame,
}) => {
  const progress = spring({
    frame: frame - startFrame,
    fps: 30,
    config: { damping: 12, stiffness: 200, mass: 0.5 },
  });

  const scale = interpolate(progress, [0, 1], [0, 1]);
  const opacity = interpolate(frame - startFrame, [0, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (frame < startFrame) return <span style={{ color: "transparent" }}>✓</span>;

  return (
    <span
      style={{
        color: "#3fb950",
        display: "inline-block",
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      ✓
    </span>
  );
};

export const RunScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneIn = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 100 },
  });

  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Passed banner appears after last step
  const passedOpacity = interpolate(frame, [100, 115], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Header lines appear
  const headerOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
        02 / RUN
      </div>

      {/* Terminal panel */}
      <div
        style={{
          flex: 1,
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
              ghostrun — zsh
            </span>
          </div>

          <div
            style={{
              fontFamily: "Menlo, Consolas, 'Courier New', monospace",
              fontSize: 12.5,
              lineHeight: 1.75,
              flex: 1,
              overflow: "hidden",
            }}
          >
            {/* Command line */}
            <div style={{ color: "#e6edf3", opacity: headerOpacity }}>
              $ node ghostrun.js run login-flow
            </div>
            <div style={{ minHeight: "1.75em" }} />

            {/* Header */}
            <div style={{ color: "#e6edf3", opacity: headerOpacity, fontWeight: 600 }}>
              Running: Login Flow  👤
            </div>
            <div style={{ color: "#6e7681", opacity: headerOpacity }}>
              URL: https://app.example.com
            </div>
            <div style={{ minHeight: "1.75em" }} />

            {/* Separator */}
            {frame >= 20 && (
              <div style={{ color: "#30363d" }}>{SEPARATOR}</div>
            )}

            {/* Steps */}
            {RUN_STEPS.map((step) => {
              if (frame < step.startFrame) return null;
              const stepOpacity = interpolate(
                frame - step.startFrame,
                [0, 8],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              return (
                <div
                  key={step.num}
                  style={{
                    opacity: stepOpacity,
                    display: "flex",
                    gap: 8,
                    color: "#e6edf3",
                    whiteSpace: "pre",
                  }}
                >
                  <span style={{ color: "#6e7681", minWidth: 18, textAlign: "right" }}>
                    {step.num}
                  </span>
                  <span style={{ color: "#30363d" }}> </span>
                  <CheckMark startFrame={step.startFrame} frame={frame} />
                  <span style={{ color: "#30363d" }}> </span>
                  <span style={{ flex: 1, color: "#e6edf3" }}>
                    {step.label.padEnd(20)}
                  </span>
                  <span style={{ color: "#6e7681", textAlign: "right", minWidth: 50 }}>
                    {step.ms}ms
                  </span>
                </div>
              );
            })}

            {/* Separator */}
            {frame >= 95 && (
              <div style={{ color: "#30363d" }}>{SEPARATOR}</div>
            )}

            {/* Passed */}
            {frame >= 100 && (
              <div
                style={{
                  opacity: passedOpacity,
                  color: "#3fb950",
                  fontWeight: 700,
                  marginTop: 4,
                  fontSize: 13,
                }}
              >
                ✓ Passed in 1.1s
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Screenshots panel */}
      <div
        style={{
          flex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 0,
          position: "relative",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "#6e7681",
            fontFamily: "Menlo, monospace",
            letterSpacing: 1,
            marginBottom: 24,
            textTransform: "uppercase",
          }}
        >
          Screenshots
        </div>

        {/* Stacked polaroid cards */}
        <div
          style={{
            position: "relative",
            width: 260,
            height: 340,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Card 3 - back */}
          <div style={{ position: "absolute", top: 60, left: 30 }}>
            <ScreenshotCard
              src="step-7.png"
              label="step-7 · assert dashboard"
              startFrame={95}
              rotation={5}
            />
          </div>

          {/* Card 2 - middle */}
          <div style={{ position: "absolute", top: 30, left: 15 }}>
            <ScreenshotCard
              src="step-3.png"
              label="step-3 · fill credentials"
              startFrame={65}
              rotation={-3}
            />
          </div>

          {/* Card 1 - front */}
          <div style={{ position: "absolute", top: 0, left: 0 }}>
            <ScreenshotCard
              src="step-1.png"
              label="step-1 · navigate"
              startFrame={30}
              rotation={1}
            />
          </div>
        </div>

        {/* Step counter badge */}
        {frame >= 100 && (
          <div
            style={{
              marginTop: 32,
              backgroundColor: "#1c2128",
              border: "1px solid #3fb95066",
              borderRadius: 20,
              padding: "6px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: interpolate(frame, [100, 110], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#3fb950",
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: "#3fb950",
                fontFamily: "Menlo, monospace",
              }}
            >
              6 / 6 steps passed
            </span>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
