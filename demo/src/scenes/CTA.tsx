import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";

export const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const heroProgress = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 80 },
  });

  const taglineProgress = spring({
    frame: frame - 10,
    fps,
    config: { damping: 18, stiffness: 80 },
  });

  const npmProgress = spring({
    frame: frame - 22,
    fps,
    config: { damping: 14, stiffness: 90 },
  });

  const urlProgress = spring({
    frame: frame - 32,
    fps,
    config: { damping: 14, stiffness: 90 },
  });

  const logoProgress = spring({
    frame: frame - 40,
    fps,
    config: { damping: 16, stiffness: 80 },
  });

  // Glow pulse
  const glowPulse = Math.sin((frame / fps) * Math.PI * 2) * 0.2 + 0.8;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0d1117",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* Background gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(0, 212, 255, 0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Headline */}
      <div
        style={{
          opacity: interpolate(heroProgress, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(heroProgress, [0, 1], [20, 0])}px)`,
          fontSize: 46,
          fontWeight: 800,
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#ffffff",
          letterSpacing: -1.5,
          textAlign: "center",
          lineHeight: 1.15,
          marginBottom: 32,
        }}
      >
        Record once.{" "}
        <span
          style={{
            color: "#00d4ff",
            textShadow: `0 0 ${30 * glowPulse}px rgba(0, 212, 255, 0.5)`,
          }}
        >
          Replay forever.
        </span>
      </div>

      {/* npm install */}
      <div
        style={{
          opacity: interpolate(npmProgress, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(npmProgress, [0, 1], [16, 0])}px)`,
          backgroundColor: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 8,
          padding: "10px 20px",
          fontFamily: "Menlo, Consolas, monospace",
          fontSize: 15,
          color: "#e6edf3",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ color: "#6e7681", userSelect: "none" }}>$</span>
        <span>
          npm install{" "}
          <span style={{ color: "#00d4ff", fontWeight: 600 }}>-g flowmind</span>
        </span>
        <span
          style={{
            display: "inline-block",
            width: 7,
            height: "0.9em",
            backgroundColor: "#00d4ff",
            marginLeft: 2,
            verticalAlign: "text-bottom",
            opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0,
          }}
        />
      </div>

      {/* URL */}
      <div
        style={{
          opacity: interpolate(urlProgress, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(urlProgress, [0, 1], [12, 0])}px)`,
          fontSize: 15,
          color: "#00d4ff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          letterSpacing: 0.3,
          marginBottom: 40,
        }}
      >
        flowmind.builtbysharan.com
      </div>

      {/* Logo + wordmark */}
      <div
        style={{
          opacity: interpolate(logoProgress, [0, 1], [0, 1]),
          transform: `scale(${interpolate(logoProgress, [0, 1], [0.8, 1])})`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 72 72"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="ctaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00d4ff" />
              <stop offset="100%" stopColor="#0066ff" />
            </linearGradient>
          </defs>
          <polygon
            points="36,4 64,20 64,52 36,68 8,52 8,20"
            fill="url(#ctaGrad)"
            opacity="0.15"
          />
          <polygon
            points="36,4 64,20 64,52 36,68 8,52 8,20"
            stroke="url(#ctaGrad)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M22 36 C22 28 30 24 36 24 C42 24 50 28 50 36"
            stroke="url(#ctaGrad)"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="36" cy="36" r="5" fill="url(#ctaGrad)" />
          <path
            d="M46 33 L50 36 L46 39"
            stroke="url(#ctaGrad)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="22" cy="48" r="3" fill="#00d4ff" opacity="0.7" />
          <circle cx="36" cy="52" r="3" fill="#00d4ff" opacity="0.5" />
          <circle cx="50" cy="48" r="3" fill="#00d4ff" opacity="0.7" />
          <line x1="22" y1="48" x2="36" y2="52" stroke="#00d4ff" strokeWidth="1" opacity="0.4" />
          <line x1="36" y1="52" x2="50" y2="48" stroke="#00d4ff" strokeWidth="1" opacity="0.4" />
        </svg>
        <span
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#ffffff",
            fontFamily: "system-ui, -apple-system, sans-serif",
            letterSpacing: -0.5,
          }}
        >
          Flow<span style={{ color: "#00d4ff" }}>Mind</span>
        </span>
      </div>
    </AbsoluteFill>
  );
};
