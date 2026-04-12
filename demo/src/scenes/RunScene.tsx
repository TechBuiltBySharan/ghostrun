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

interface RunStep {
  num: number;
  total: number;
  label: string;
  ms: number;
  startFrame: number;
  barFull: number; // how many full blocks (out of 20)
}

const RUN_STEPS: RunStep[] = [
  { num: 1, total: 5, label: "Navigate to login page",      ms: 312,  startFrame: 20, barFull: 16 },
  { num: 2, total: 5, label: "Fill email field",            ms: 89,   startFrame: 38, barFull: 20 },
  { num: 3, total: 5, label: "Fill password field",         ms: 76,   startFrame: 54, barFull: 20 },
  { num: 4, total: 5, label: 'Click "Sign In" button',      ms: 445,  startFrame: 70, barFull: 20 },
  { num: 5, total: 5, label: "Assert redirect to /dashboard", ms: 201, startFrame: 88, barFull: 20 },
];

const CheckMark: React.FC<{ startFrame: number; frame: number }> = ({
  startFrame,
  frame,
}) => {
  const progress = spring({
    frame: Math.max(0, frame - startFrame),
    fps: 30,
    config: { damping: 10, stiffness: 250, mass: 0.4 },
  });

  const scale = interpolate(progress, [0, 1], [0, 1.2]);
  const finalScale = frame > startFrame + 10 ? 1 : scale;
  const opacity = interpolate(Math.max(0, frame - startFrame), [0, 5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const flashOpacity = interpolate(Math.max(0, frame - startFrame), [0, 3, 8], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (frame < startFrame) return null;

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span
        style={{
          color: "#3fb950",
          display: "inline-block",
          transform: `scale(${finalScale})`,
          opacity,
          textShadow: `0 0 ${interpolate(Math.max(0, frame - startFrame), [0, 5, 15], [20, 30, 8], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px rgba(63, 185, 80, 0.8)`,
        }}
      >
        ✓
      </span>
      {/* Flash burst */}
      <span
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 30,
          height: 30,
          borderRadius: "50%",
          backgroundColor: "rgba(63, 185, 80, 0.3)",
          opacity: flashOpacity,
          pointerEvents: "none",
        }}
      />
    </span>
  );
};

const ProgressBar: React.FC<{ full: number; startFrame: number; frame: number }> = ({
  full,
  startFrame,
  frame,
}) => {
  const progress = interpolate(Math.max(0, frame - startFrame), [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const filledBlocks = Math.round(progress * full);
  const emptyBlocks = 20 - full;

  return (
    <span>
      <span style={{ color: "#39d0d8", letterSpacing: 0, fontSize: 11 }}>
        {"█".repeat(filledBlocks)}
      </span>
      <span style={{ color: "#39d0d818", fontSize: 11 }}>
        {"█".repeat(full - filledBlocks)}
      </span>
      <span style={{ color: "#39d0d818", fontSize: 11 }}>
        {"░".repeat(emptyBlocks)}
      </span>
    </span>
  );
};

export const RunScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const passedSpring = spring({
    frame: Math.max(0, frame - 98),
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
  });

  const passedOpacity = interpolate(frame, [98, 112], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Screenshot panel slide in
  const ssSpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 80 },
  });
  const ssX = interpolate(ssSpring, [0, 1], [40, 0]);
  const ssOpacity = interpolate(frame, [5, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#080c10",
        padding: 40,
        flexDirection: "row",
        gap: 28,
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

          <div
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
              fontSize: 12.5,
              lineHeight: 1.85,
              flex: 1,
              overflow: "hidden",
            }}
          >
            <div style={{ color: "#e6edf3" }}>
              <span style={{ color: "#6e7681" }}>$</span> ghostrun run a3f8c2b1
            </div>
            <div style={{ minHeight: "1.85em" }} />
            <div style={{ color: "#e6edf3", fontWeight: 700, fontSize: 14 }}>
              Running: Login Flow 👤
            </div>
            <div style={{ color: "#6e7681", fontSize: 12, marginBottom: 16 }}>
              a3f8c2b1 · production
            </div>

            {/* Steps */}
            {RUN_STEPS.map((step) => {
              if (frame < step.startFrame - 2) return null;
              const stepOpacity = interpolate(
                frame - step.startFrame + 2,
                [0, 10],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              const resultOpacity = interpolate(
                frame - step.startFrame,
                [8, 18],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              return (
                <div
                  key={step.num}
                  style={{ opacity: stepOpacity, marginBottom: 4 }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      color: "#e6edf3",
                    }}
                  >
                    <span style={{ color: "#6e7681", fontSize: 11, minWidth: 36 }}>
                      [{step.num}/{step.total}]
                    </span>
                    <ProgressBar
                      full={step.barFull}
                      startFrame={step.startFrame}
                      frame={frame}
                    />
                    <span style={{ fontSize: 12.5 }}>{step.label}</span>
                  </div>
                  <div
                    style={{
                      paddingLeft: 48,
                      opacity: resultOpacity,
                      color: "#6e7681",
                      fontSize: 11.5,
                    }}
                  >
                    <CheckMark startFrame={step.startFrame + 10} frame={frame} />
                    <span style={{ marginLeft: 4 }}>passed ({step.ms}ms)</span>
                  </div>
                </div>
              );
            })}

            {/* Separator + Passed */}
            {frame >= 96 && (
              <div style={{ color: "#21262d", marginTop: 8 }}>
                ────────────────────────────────────────────
              </div>
            )}
            {frame >= 98 && (
              <div
                style={{
                  opacity: passedOpacity,
                  transform: `translateY(${interpolate(passedSpring, [0, 1], [10, 0])}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginTop: 4,
                }}
              >
                <span
                  style={{
                    color: "#3fb950",
                    fontSize: 16,
                    fontWeight: 700,
                    textShadow: "0 0 20px rgba(63, 185, 80, 0.6)",
                  }}
                >
                  ✓ Flow passed!
                </span>
                <span style={{ color: "#6e7681", fontSize: 13 }}>(1123ms)</span>
              </div>
            )}
            {frame >= 100 && (
              <div
                style={{
                  opacity: interpolate(frame, [100, 114], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                  color: "#6e7681",
                  fontSize: 12,
                }}
              >
                → Run ID: <span style={{ color: "#39d0d8" }}>a3f8c2b1</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Screenshot panel */}
      <div
        style={{
          flex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          opacity: ssOpacity,
          transform: `translateX(${ssX}px)`,
        }}
      >
        <div
          style={{
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid #21262d",
            boxShadow: "0 0 30px rgba(63,185,80,0.08), 0 20px 50px rgba(0,0,0,0.6)",
          }}
        >
          <Img
            src={staticFile("screen-run.png")}
            style={{ width: "100%", display: "block" }}
          />
        </div>

        {/* Pass rate badge */}
        {frame >= 100 && (
          <div
            style={{
              marginTop: 16,
              opacity: interpolate(frame, [100, 115], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              transform: `scale(${interpolate(
                spring({ frame: Math.max(0, frame - 100), fps, config: { damping: 14, stiffness: 160, mass: 0.6 } }),
                [0, 1],
                [0.7, 1]
              )})`,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                backgroundColor: "rgba(63, 185, 80, 0.1)",
                border: "1px solid rgba(63, 185, 80, 0.35)",
                borderRadius: 20,
                padding: "8px 20px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 0 20px rgba(63, 185, 80, 0.15)",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#3fb950",
                  boxShadow: "0 0 8px rgba(63, 185, 80, 0.8)",
                }}
              />
              <span
                style={{
                  fontSize: 13,
                  color: "#3fb950",
                  fontFamily: "'JetBrains Mono', Menlo, monospace",
                  fontWeight: 600,
                }}
              >
                5 / 5 steps passed
              </span>
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
