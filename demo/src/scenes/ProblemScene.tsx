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

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Screen slides in from right
  const slideSpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 90, mass: 1 },
  });

  const screenX = interpolate(slideSpring, [0, 1], [200, 0]);
  const screenOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Overlay text appears
  const overlayOpacity = interpolate(frame, [25, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Red flash on failure line
  const flashIntensity = interpolate(
    Math.sin((frame / fps) * Math.PI * 3),
    [-1, 1],
    [0.06, 0.18]
  );

  // "Until now." transition text
  const untilNowOpacity = interpolate(frame, [70, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const untilNowScale = spring({
    frame: Math.max(0, frame - 70),
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.8 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#080c10",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 60,
        padding: "40px 60px",
      }}
    >
      {/* Background ambient glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(248, 81, 73, 0.04) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Screenshot of fail screen */}
      <div
        style={{
          flex: 1,
          opacity: screenOpacity,
          transform: `translateX(${screenX}px)`,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow:
            "0 0 40px rgba(248, 81, 73, 0.15), 0 20px 60px rgba(0,0,0,0.8)",
          border: "1px solid #30363d",
          position: "relative",
        }}
      >
        <Img
          src={staticFile("screen-fail.png")}
          style={{ width: "100%", display: "block" }}
        />
        {/* Red flash overlay on the failure area */}
        <div
          style={{
            position: "absolute",
            top: "52%",
            left: 0,
            right: 0,
            height: "16%",
            backgroundColor: `rgba(248, 81, 73, ${flashIntensity})`,
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Right side text */}
      <div
        style={{
          flex: "0 0 380px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          opacity: overlayOpacity,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', Menlo, monospace",
            color: "#6e7681",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          The problem
        </div>
        <div
          style={{
            fontSize: 42,
            fontWeight: 800,
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#ffffff",
            letterSpacing: -1.5,
            lineHeight: 1.15,
          }}
        >
          Tests break.{" "}
          <span
            style={{
              color: "#f85149",
              textShadow: "0 0 30px rgba(248, 81, 73, 0.5)",
            }}
          >
            Selectors rot.
          </span>
        </div>
        <div
          style={{
            fontSize: 16,
            color: "#8b949e",
            fontFamily: "system-ui, -apple-system, sans-serif",
            lineHeight: 1.6,
          }}
        >
          Every UI change breaks your automation.
          <br />
          Debugging takes longer than recording.
        </div>

        {/* Pain points */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginTop: 8,
          }}
        >
          {[
            "❌ Selectors change overnight",
            "❌ No clue why it failed",
            "❌ Manual fixes every sprint",
          ].map((text, i) => (
            <div
              key={i}
              style={{
                opacity: interpolate(frame, [30 + i * 12, 48 + i * 12], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                transform: `translateX(${interpolate(
                  frame,
                  [30 + i * 12, 48 + i * 12],
                  [16, 0],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                )}px)`,
                fontSize: 14,
                fontFamily: "system-ui, -apple-system, sans-serif",
                color: "#e6edf3",
              }}
            >
              {text}
            </div>
          ))}
        </div>
      </div>

      {/* "Until now." overlay — appears at end of scene */}
      {frame >= 68 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: `rgba(8, 12, 16, ${interpolate(frame, [68, 90], [0, 0.85], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              opacity: untilNowOpacity,
              transform: `scale(${interpolate(untilNowScale, [0, 1], [0.8, 1])})`,
              fontSize: 56,
              fontWeight: 800,
              fontFamily: "system-ui, -apple-system, sans-serif",
              color: "#39d0d8",
              textShadow: "0 0 40px rgba(57, 208, 216, 0.6)",
              letterSpacing: -2,
            }}
          >
            Until now.
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
