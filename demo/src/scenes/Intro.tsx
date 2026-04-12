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

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo fades + scales in with spring
  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 70, mass: 1 },
  });

  const logoOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const logoScale = interpolate(logoSpring, [0, 1], [0.5, 1]);

  // Title typewriter effect
  const TITLE = "GhostRun";
  const titleChars = Math.floor(
    interpolate(frame, [25, 65], [0, TITLE.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  const titleOpacity = interpolate(frame, [25, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Tagline fades in
  const taglineOpacity = interpolate(frame, [70, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const taglineY = interpolate(frame, [70, 90], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow pulse
  const glowIntensity = interpolate(
    Math.sin((frame / fps) * Math.PI * 1.5),
    [-1, 1],
    [24, 48]
  );

  const glowOpacity = interpolate(
    Math.sin((frame / fps) * Math.PI * 1.5),
    [-1, 1],
    [0.4, 0.7]
  );

  // Background radial animation
  const bgGlow = interpolate(frame, [0, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cursorVisible = Math.floor(frame / 15) % 2 === 0 && titleChars < TITLE.length;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#080c10",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* Animated background radial glow */}
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, rgba(57, 208, 216, ${0.1 * bgGlow}) 0%, transparent 70%)`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      {/* Secondary glow ring */}
      <div
        style={{
          position: "absolute",
          width: 300,
          height: 300,
          borderRadius: "50%",
          border: `1px solid rgba(57, 208, 216, ${0.08 * bgGlow})`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          boxShadow: `0 0 60px rgba(57, 208, 216, ${0.06 * bgGlow})`,
          pointerEvents: "none",
        }}
      />

      {/* Logo image */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 28,
            overflow: "hidden",
            boxShadow: `0 0 ${glowIntensity}px rgba(57, 208, 216, ${glowOpacity}), 0 0 80px rgba(57, 208, 216, 0.2)`,
          }}
        >
          <Img
            src={staticFile("logo.png")}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>

        {/* GhostRun typewriter title */}
        <div
          style={{
            opacity: titleOpacity,
            fontSize: 68,
            fontWeight: 800,
            fontFamily:
              "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
            letterSpacing: -2,
            color: "#ffffff",
            textShadow: `0 0 ${glowIntensity}px rgba(57, 208, 216, ${glowOpacity * 0.8}), 0 0 60px rgba(57, 208, 216, 0.2)`,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#39d0d8" }}>Ghost</span>
          <span>{TITLE.slice(5, titleChars)}</span>
          {cursorVisible && (
            <span
              style={{
                display: "inline-block",
                width: 4,
                height: "0.85em",
                backgroundColor: "#39d0d8",
                marginLeft: 2,
                verticalAlign: "text-bottom",
                borderRadius: 2,
              }}
            />
          )}
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          marginTop: 24,
          fontSize: 19,
          fontFamily:
            "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
          color: "#8b949e",
          fontWeight: 400,
          letterSpacing: 0.3,
          textAlign: "center",
        }}
      >
        Record once.{" "}
        <span
          style={{
            color: "#39d0d8",
            textShadow: `0 0 20px rgba(57, 208, 216, 0.5)`,
          }}
        >
          Replay as a ghost.
        </span>
      </div>
    </AbsoluteFill>
  );
};
