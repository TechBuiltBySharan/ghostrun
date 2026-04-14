import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

const C = { cyan: "#39d0d8", green: "#3fb950", red: "#f85149", amber: "#d29922", dim: "#6e7681", text: "#e6edf3", bg: "#0d1117", border: "#21262d" };

const CURL_CMD = '$ ghostrun flow:from-curl "curl -X POST https://api.myapp.com/auth/login -H \'Content-Type: application/json\' -d \'{\\"email\\":\\"user@myapp.com\\",\\"password\\":\\"secret\\"}\'"';
const CURL_SHORT = '$ ghostrun flow:from-curl "curl -X POST /auth/login ..."';

const STEPS = [
  { label: "POST /auth/login", status: "pass", detail: "→ 200 OK  (38ms)", extract: 'authToken = "tok_x8kQ2..."', startFrame: 55 },
  { label: "Assert status = 200", status: "pass", detail: "✓ passed", extract: null, startFrame: 70 },
  { label: "GET /users (Bearer {{authToken}})", status: "pass", detail: "→ 200 OK  (12ms)", extract: 'userId = "usr_19f..."', startFrame: 85 },
  { label: "Assert users.length ≥ 1", status: "pass", detail: "✓ passed", extract: null, startFrame: 100 },
];

const StepRow: React.FC<{ step: typeof STEPS[0]; frame: number; fps: number }> = ({ step, frame, fps }) => {
  const s = spring({ frame: Math.max(0, frame - step.startFrame), fps, config: { damping: 16, stiffness: 120 } });
  const opacity = interpolate(Math.max(0, frame - step.startFrame), [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const x = interpolate(s, [0, 1], [-20, 0]);

  return (
    <div style={{ opacity, transform: `translateX(${x}px)`, display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 13 }}>
        <span style={{ color: C.green, fontSize: 12 }}>✓</span>
        <span style={{ color: C.text }}>{step.label}</span>
        <span style={{ color: C.dim, marginLeft: "auto" }}>{step.detail}</span>
      </div>
      {step.extract && (
        <div style={{ marginLeft: 24, fontSize: 11, color: C.cyan, fontFamily: "'JetBrains Mono', Menlo, monospace" }}>
          → extracted: {step.extract}
        </div>
      )}
    </div>
  );
};

export const ApiScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Label
  const labelOpacity = interpolate(frame, [5, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Curl command types in
  const curlChars = Math.floor(interpolate(frame, [10, 45], [0, CURL_SHORT.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const curlOpacity = interpolate(frame, [10, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cursorVisible = Math.floor(frame / 15) % 2 === 0;

  // "Flow created" badge
  const badgeOpacity = interpolate(frame, [48, 56], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const badgeS = spring({ frame: Math.max(0, frame - 48), fps, config: { damping: 10, stiffness: 220, mass: 0.5 } });
  const badgeScale = interpolate(badgeS, [0, 1], [0.7, 1]);

  // Run command
  const runOpacity = interpolate(frame, [50, 58], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Extracted data panel
  const extractPanelOpacity = interpolate(frame, [110, 125], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const extractS = spring({ frame: Math.max(0, frame - 110), fps, config: { damping: 14, stiffness: 90 } });
  const extractY = interpolate(extractS, [0, 1], [20, 0]);

  const glowPulse = interpolate(Math.sin((frame / fps) * Math.PI * 2), [-1, 1], [0.3, 0.7]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#080c10", opacity: sceneOpacity }}>
      <div style={{ position: "absolute", width: 700, height: 350, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(57,208,216,0.04) 0%, transparent 70%)", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />

      {/* Scene label */}
      <div style={{ position: "absolute", top: 20, left: 44, opacity: labelOpacity, fontSize: 11, color: C.dim, fontFamily: "'JetBrains Mono', Menlo, monospace", letterSpacing: 2, textTransform: "uppercase" }}>
        02 / API TESTING
      </div>
      <div style={{ position: "absolute", top: 20, right: 44, opacity: labelOpacity, fontSize: 11, color: C.dim, fontFamily: "'JetBrains Mono', Menlo, monospace" }}>
        No browser required
      </div>

      <AbsoluteFill style={{ padding: "56px 44px", flexDirection: "row", gap: 28, alignItems: "center" }}>

        {/* Left: terminal */}
        <div style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* from-curl command */}
          <div style={{
            opacity: curlOpacity, backgroundColor: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "16px 20px",
            boxShadow: `0 0 30px rgba(57,208,216,0.06)`,
          }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#ff5f57" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#ffbd2e" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#28ca41" }} />
              <span style={{ marginLeft: 8, color: C.dim, fontSize: 10, fontFamily: "'JetBrains Mono', Menlo, monospace" }}>ghostrun — zsh</span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 11.5, color: C.text, lineHeight: 1.7 }}>
              {CURL_SHORT.slice(0, curlChars)}
              {curlChars < CURL_SHORT.length && cursorVisible && (
                <span style={{ display: "inline-block", width: 6, height: "0.85em", backgroundColor: C.cyan, marginLeft: 1, verticalAlign: "text-bottom", borderRadius: 1 }} />
              )}
            </div>
          </div>

          {/* "Flow created" badge */}
          {frame >= 48 && (
            <div style={{
              opacity: badgeOpacity, transform: `scale(${badgeScale})`,
              display: "flex", alignItems: "center", gap: 10,
              backgroundColor: "rgba(57,208,216,0.06)", border: `1px solid rgba(57,208,216,0.25)`,
              borderRadius: 8, padding: "8px 16px",
              fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 12, color: C.cyan,
            }}>
              <span style={{ color: C.green }}>✓</span>
              <span>Flow created: <strong>POST /auth/login</strong> (4 steps)</span>
            </div>
          )}

          {/* Run command */}
          {frame >= 50 && (
            <div style={{ opacity: runOpacity, fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 12, color: C.dim, paddingLeft: 4 }}>
              $ ghostrun run "POST /auth/login"
            </div>
          )}

          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 4 }}>
            {STEPS.map((step, i) => (
              <StepRow key={i} step={step} frame={frame} fps={fps} />
            ))}
          </div>
        </div>

        {/* Right: extracted data panel */}
        <div style={{
          flex: 1, opacity: extractPanelOpacity, transform: `translateY(${extractY}px)`,
          backgroundColor: C.bg, border: `1px solid rgba(57,208,216,0.2)`,
          borderRadius: 12, padding: "20px 24px",
          boxShadow: `0 0 40px rgba(57,208,216,${glowPulse * 0.15})`,
        }}>
          <div style={{ fontSize: 11, color: C.dim, fontFamily: "'JetBrains Mono', Menlo, monospace", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16 }}>
            Extracted Data
          </div>
          {[
            { key: "authToken", val: '"tok_x8kQ2vbLmnRp..."', step: 1 },
            { key: "userId", val: '"usr_19fKw8..."', step: 3 },
          ].map((item) => (
            <div key={item.key} style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 12.5, color: C.cyan, fontWeight: 600 }}>{item.key}</span>
                <span style={{ fontSize: 10, color: C.dim, fontFamily: "'JetBrains Mono', Menlo, monospace" }}>step {item.step}</span>
              </div>
              <span style={{ fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 12, color: C.text }}>{item.val}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: C.green, fontFamily: "'JetBrains Mono', Menlo, monospace" }}>
              ✓ 4/4 steps passed · 50ms total
            </div>
            <div style={{ fontSize: 10, color: C.dim, fontFamily: "system-ui, sans-serif", marginTop: 4 }}>
              No browser launched
            </div>
          </div>
        </div>

      </AbsoluteFill>
    </AbsoluteFill>
  );
};
