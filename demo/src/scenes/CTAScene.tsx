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

// Animated stars counter
const StarCounter: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const targetStars = 1247;
  const countProgress = spring({
    frame: Math.max(0, frame - 20),
    fps,
    config: { damping: 20, stiffness: 40, mass: 1.5 },
  });
  const count = Math.round(interpolate(countProgress, [0, 1], [0, targetStars]));

  const opacity = interpolate(frame, [20, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        opacity,
        display: "flex",
        alignItems: "center",
        gap: 8,
        backgroundColor: "rgba(210, 153, 34, 0.1)",
        border: "1px solid rgba(210, 153, 34, 0.3)",
        borderRadius: 20,
        padding: "6px 16px",
      }}
    >
      <span style={{ color: "#d29922", fontSize: 16 }}>★</span>
      <span
        style={{
          color: "#d29922",
          fontFamily: "'JetBrains Mono', Menlo, monospace",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {count.toLocaleString()}
      </span>
      <span
        style={{
          color: "#6e7681",
          fontFamily: "'JetBrains Mono', Menlo, monospace",
          fontSize: 12,
        }}
      >
        GitHub stars
      </span>
    </div>
  );
};

// Typewriter for npm command
const NpmCommand: React.FC<{ frame: number }> = ({ frame }) => {
  const CMD = "npm install -g ghostrun";
  const startFrame = 8;
  const chars = Math.min(
    CMD.length,
    Math.floor(interpolate(frame, [startFrame, startFrame + 45], [0, CMD.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }))
  );

  const opacity = interpolate(frame, [startFrame, startFrame + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cursorVisible = Math.floor(frame / 15) % 2 === 0;

  return (
    <div
      style={{
        opacity,
        backgroundColor: "#0d1117",
        border: "1px solid #21262d",
        borderRadius: 10,
        padding: "12px 22px",
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
        fontSize: 16,
        color: "#e6edf3",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 0 30px rgba(57, 208, 216, 0.12)",
      }}
    >
      <span style={{ color: "#6e7681" }}>$</span>
      <span>
        npm install{" "}
        <span style={{ color: "#39d0d8", fontWeight: 700 }}>-g ghostrun</span>
        {CMD.slice(CMD.indexOf("ghostrun") + 8, chars)}
      </span>
      {chars < CMD.length && cursorVisible && (
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: "0.9em",
            backgroundColor: "#39d0d8",
            marginLeft: 1,
            verticalAlign: "text-bottom",
            borderRadius: 2,
          }}
        />
      )}
    </div>
  );
};

export const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Hero background fades in
  const heroBgOpacity = interpolate(frame, [0, 20], [0, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Logo springs in
  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 80, mass: 1 },
  });
  const logoScale = interpolate(logoSpring, [0, 1], [0.6, 1]);
  const logoOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Tagline
  const taglineSpring = spring({
    frame: Math.max(0, frame - 40),
    fps,
    config: { damping: 16, stiffness: 80, mass: 1 },
  });
  const taglineOpacity = interpolate(frame, [40, 58], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(taglineSpring, [0, 1], [20, 0]);

  // URL
  const urlOpacity = interpolate(frame, [60, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const urlY = interpolate(frame, [60, 75], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow pulse
  const glowPulse = interpolate(
    Math.sin((frame / fps) * Math.PI * 1.8),
    [-1, 1],
    [0.5, 1]
  );

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
      {/* Hero image background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: heroBgOpacity,
        }}
      >
        <Img
          src={staticFile("hero.png")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>

      {/* Dark overlay on hero */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: `rgba(8, 12, 16, 0.82)`,
          pointerEvents: "none",
        }}
      />

      {/* Radial glow */}
      <div
        style={{
          position: "absolute",
          width: 700,
          height: 350,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, rgba(57, 208, 216, ${0.08 * glowPulse}) 0%, transparent 70%)`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      {/* Content stack */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        {/* Logo */}
        <div
          style={{
            opacity: logoOpacity,
            transform: `scale(${logoScale})`,
            width: 100,
            height: 100,
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: `0 0 ${40 * glowPulse}px rgba(57, 208, 216, ${0.5 * glowPulse}), 0 0 80px rgba(57, 208, 216, 0.2)`,
          }}
        >
          <Img
            src={staticFile("logo.png")}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>

        {/* npm install command */}
        <NpmCommand frame={frame} />

        {/* Star counter */}
        <StarCounter frame={frame} fps={fps} />

        {/* Main tagline */}
        <div
          style={{
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 40,
              fontWeight: 800,
              fontFamily: "system-ui, -apple-system, sans-serif",
              color: "#ffffff",
              letterSpacing: -1.5,
              lineHeight: 1.2,
              textShadow: "0 2px 20px rgba(0,0,0,0.5)",
            }}
          >
            The web automation tool{" "}
            <span
              style={{
                color: "#39d0d8",
                textShadow: `0 0 ${30 * glowPulse}px rgba(57, 208, 216, ${0.6 * glowPulse})`,
              }}
            >
              that never sleeps.
            </span>
          </div>
        </div>

        {/* URL */}
        <div
          style={{
            opacity: urlOpacity,
            transform: `translateY(${urlY}px)`,
            fontSize: 15,
            color: "#39d0d8",
            fontFamily: "'JetBrains Mono', Menlo, monospace",
            letterSpacing: 0.3,
            textShadow: "0 0 20px rgba(57, 208, 216, 0.4)",
          }}
        >
          ghostrun.builtbysharan.com
        </div>
      </div>
    </AbsoluteFill>
  );
};
