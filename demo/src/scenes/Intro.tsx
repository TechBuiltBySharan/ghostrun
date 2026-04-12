import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo fades + scales in
  const logoProgress = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 80, mass: 1 },
  });

  const logoOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const logoScale = interpolate(logoProgress, [0, 1], [0.7, 1]);

  // Tagline fades in after logo
  const taglineOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const taglineY = interpolate(frame, [20, 45], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow pulse
  const glowIntensity = interpolate(
    Math.sin((frame / fps) * Math.PI * 2),
    [-1, 1],
    [20, 40]
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0d1117",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Background radial glow */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 300,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, rgba(0, 212, 255, 0.08) 0%, transparent 70%)`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      {/* Logo mark + text */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Logo mark */}
        <svg
          width="72"
          height="72"
          viewBox="0 0 72 72"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00d4ff" />
              <stop offset="100%" stopColor="#0066ff" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Hexagon background */}
          <polygon
            points="36,4 64,20 64,52 36,68 8,52 8,20"
            fill="url(#logoGrad)"
            opacity="0.15"
          />
          <polygon
            points="36,4 64,20 64,52 36,68 8,52 8,20"
            stroke="url(#logoGrad)"
            strokeWidth="2"
            fill="none"
            filter="url(#glow)"
          />
          {/* Flow arrows */}
          <path
            d="M22 36 C22 28 30 24 36 24 C42 24 50 28 50 36"
            stroke="url(#logoGrad)"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            filter="url(#glow)"
          />
          <circle cx="36" cy="36" r="5" fill="url(#logoGrad)" filter="url(#glow)" />
          <path
            d="M46 33 L50 36 L46 39"
            stroke="url(#logoGrad)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Memory dots */}
          <circle cx="22" cy="48" r="3" fill="#00d4ff" opacity="0.8" />
          <circle cx="36" cy="52" r="3" fill="#00d4ff" opacity="0.6" />
          <circle cx="50" cy="48" r="3" fill="#00d4ff" opacity="0.8" />
          <line x1="22" y1="48" x2="36" y2="52" stroke="#00d4ff" strokeWidth="1" opacity="0.5" />
          <line x1="36" y1="52" x2="50" y2="48" stroke="#00d4ff" strokeWidth="1" opacity="0.5" />
        </svg>

        {/* FlowMind text */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            fontFamily: "system-ui, -apple-system, sans-serif",
            letterSpacing: -2,
            color: "#ffffff",
            textShadow: `0 0 ${glowIntensity}px rgba(0, 212, 255, 0.6), 0 0 60px rgba(0, 212, 255, 0.3)`,
            lineHeight: 1,
          }}
        >
          Flow
          <span style={{ color: "#00d4ff" }}>Mind</span>
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          fontSize: 18,
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#8b949e",
          fontWeight: 400,
          letterSpacing: 0.5,
        }}
      >
        Memory-driven web automation
      </div>
    </AbsoluteFill>
  );
};
