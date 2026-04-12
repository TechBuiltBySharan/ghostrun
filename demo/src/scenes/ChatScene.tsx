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

// Chat messages with typewriter timings
interface ChatMessage {
  role: "you" | "ghost";
  text: string;
  startFrame: number;
}

const MESSAGES: ChatMessage[] = [
  {
    role: "you",
    text: "did my login flow pass recently?",
    startFrame: 15,
  },
  {
    role: "ghost",
    text: "Yes! The Login Flow last ran 2h ago and passed all 5 steps in 1.1s.\nIt has an 83% overall pass rate across 18 runs.",
    startFrame: 38,
  },
  {
    role: "you",
    text: "run the login flow",
    startFrame: 90,
  },
  {
    role: "ghost",
    text: "Sure! Running Login Flow now...",
    startFrame: 108,
  },
];

const CPF_GHOST = 3;
const CPF_YOU = 5;

function getTypedText(text: string, frame: number, startFrame: number, cpf: number) {
  if (frame < startFrame) return null;
  const elapsed = frame - startFrame;
  const chars = Math.min(text.length, elapsed * cpf);
  return text.slice(0, Math.floor(chars));
}

export const ChatScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneIn = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 90 },
  });

  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Header enters from top
  const headerY = interpolate(sceneIn, [0, 1], [-20, 0]);

  // Screenshot panel
  const ssSpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 80 },
  });
  const ssX = interpolate(ssSpring, [0, 1], [40, 0]);
  const ssOpacity = interpolate(frame, [5, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Run result
  const runResultOpacity = interpolate(frame, [130, 148], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const runResultSpring = spring({
    frame: Math.max(0, frame - 130),
    fps,
    config: { damping: 12, stiffness: 180, mass: 0.6 },
  });

  // Ollama badge
  const badgeOpacity = interpolate(frame, [140, 148], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const renderedMessages = MESSAGES.map((msg) => {
    const cpf = msg.role === "ghost" ? CPF_GHOST : CPF_YOU;
    const text = getTypedText(msg.text, frame, msg.startFrame, cpf);
    if (text === null) return null;
    const isTyping = text.length < msg.text.length;
    return { ...msg, rendered: text, isTyping };
  }).filter(Boolean) as (ChatMessage & { rendered: string; isTyping: boolean })[];

  const cursorVisible = Math.floor(frame / 15) % 2 === 0;

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
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 60% 40% at 30% 50%, rgba(57, 208, 216, 0.04) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

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
        04 / CHAT
      </div>

      {/* Left: Chat terminal */}
      <div
        style={{
          flex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          transform: `translateY(${headerY}px)`,
        }}
      >
        <div
          style={{
            backgroundColor: "#0d1117",
            borderRadius: 12,
            border: "1px solid #21262d",
            height: 540,
            display: "flex",
            flexDirection: "column",
            boxShadow:
              "0 0 40px rgba(57,208,216,0.08), 0 20px 40px rgba(0,0,0,0.5)",
          }}
        >
          {/* Terminal chrome */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "12px 16px",
              alignItems: "center",
              borderBottom: "1px solid #21262d",
              backgroundColor: "#161b22",
              borderRadius: "12px 12px 0 0",
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: "#ff5f57",
              }}
            />
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: "#ffbd2e",
              }}
            />
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: "#28ca41",
              }}
            />
            <span
              style={{
                marginLeft: 8,
                color: "#6e7681",
                fontSize: 11,
                fontFamily: "'JetBrains Mono', Menlo, monospace",
              }}
            >
              ghostrun chat
            </span>
          </div>

          {/* Chat content */}
          <div
            style={{
              flex: 1,
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 0,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 24 }}>👻</span>
              <span
                style={{
                  color: "#39d0d8",
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: "'JetBrains Mono', Menlo, monospace",
                  textShadow: "0 0 20px rgba(57, 208, 216, 0.4)",
                }}
              >
                GhostRun Chat
              </span>
            </div>
            <div
              style={{
                color: "#21262d",
                marginBottom: 8,
                fontFamily: "'JetBrains Mono', Menlo, monospace",
                fontSize: 12,
              }}
            >
              ─────────────────────────────────────────────
            </div>
            <div
              style={{
                color: "#6e7681",
                fontSize: 11.5,
                fontFamily: "'JetBrains Mono', Menlo, monospace",
                marginBottom: 20,
              }}
            >
              Powered by Ollama (gemma3:4b) · type{" "}
              <span style={{ color: "#39d0d8" }}>exit</span> to quit
            </div>

            {/* Messages */}
            {renderedMessages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  marginBottom: 16,
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    color: msg.role === "you" ? "#6e7681" : "#39d0d8",
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', Menlo, monospace",
                    minWidth: 52,
                    marginTop: 2,
                    flexShrink: 0,
                  }}
                >
                  {msg.role === "you" ? "You  ›" : "Ghost ›"}
                </span>
                <div
                  style={{
                    backgroundColor:
                      msg.role === "you"
                        ? "#161b22"
                        : "rgba(57, 208, 216, 0.07)",
                    border:
                      msg.role === "you"
                        ? "1px solid #21262d"
                        : "1px solid rgba(57, 208, 216, 0.2)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    color: "#e6edf3",
                    fontSize: 12.5,
                    fontFamily: "'JetBrains Mono', Menlo, monospace",
                    lineHeight: 1.7,
                    whiteSpace: "pre-line",
                  }}
                >
                  {msg.rendered}
                  {msg.isTyping && cursorVisible && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 6,
                        height: "0.85em",
                        backgroundColor: msg.role === "ghost" ? "#39d0d8" : "#e6edf3",
                        marginLeft: 2,
                        verticalAlign: "text-bottom",
                        borderRadius: 1,
                      }}
                    />
                  )}
                </div>
              </div>
            ))}

            {/* Run confirm prompt */}
            {frame >= 118 && (
              <div
                style={{
                  opacity: interpolate(frame, [118, 130], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                  backgroundColor: "#0d1117",
                  border: "1px solid rgba(57, 208, 216, 0.3)",
                  borderRadius: 6,
                  padding: "10px 14px",
                  fontFamily: "'JetBrains Mono', Menlo, monospace",
                  fontSize: 12.5,
                  marginLeft: 64,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div>
                  <span style={{ color: "#6e7681" }}>Run </span>
                  <span style={{ color: "#39d0d8" }}>"Login Flow"</span>
                  <span style={{ color: "#6e7681" }}>? (y/N) </span>
                  <span style={{ color: "#e6edf3" }}>y</span>
                </div>
                {frame >= 130 && (
                  <div
                    style={{
                      opacity: runResultOpacity,
                      transform: `translateY(${interpolate(
                        runResultSpring,
                        [0, 1],
                        [8, 0]
                      )}px)`,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      backgroundColor: "rgba(63, 185, 80, 0.12)",
                      border: "1px solid rgba(63, 185, 80, 0.35)",
                      borderRadius: 4,
                      padding: "4px 12px",
                      color: "#3fb950",
                      fontSize: 12,
                      width: "fit-content",
                      boxShadow: "0 0 16px rgba(63, 185, 80, 0.2)",
                    }}
                  >
                    ✓ Flow passed! (1089ms)
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Ollama badge */}
        {frame >= 140 && (
          <div
            style={{
              marginTop: 14,
              opacity: badgeOpacity,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                backgroundColor: "rgba(57, 208, 216, 0.08)",
                border: "1px solid rgba(57, 208, 216, 0.2)",
                borderRadius: 20,
                padding: "6px 16px",
              }}
            >
              <span style={{ fontSize: 14 }}>⚡</span>
              <span
                style={{
                  color: "#39d0d8",
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', Menlo, monospace",
                }}
              >
                Powered by Ollama — works offline
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Right: Screenshot */}
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
            boxShadow:
              "0 0 30px rgba(57,208,216,0.1), 0 20px 50px rgba(0,0,0,0.6)",
          }}
        >
          <Img
            src={staticFile("screen-chat.png")}
            style={{ width: "100%", display: "block" }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
