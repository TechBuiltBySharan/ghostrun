import React from "react";

interface BrowserMockProps {
  url?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export const BrowserMock: React.FC<BrowserMockProps> = ({
  url = "https://app.example.com",
  children,
  style,
}) => {
  return (
    <div
      style={{
        backgroundColor: "#1c2128",
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid #30363d",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      {/* Browser chrome */}
      <div
        style={{
          backgroundColor: "#21262d",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid #30363d",
          flexShrink: 0,
        }}
      >
        {/* Traffic lights */}
        <div style={{ display: "flex", gap: 6 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "#ff5f57",
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "#ffbd2e",
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "#28ca41",
            }}
          />
        </div>

        {/* URL bar */}
        <div
          style={{
            flex: 1,
            backgroundColor: "#0d1117",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 11,
            color: "#8b949e",
            fontFamily: "Menlo, Consolas, monospace",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <LockIcon />
          <span style={{ color: "#e6edf3" }}>{url}</span>
        </div>
      </div>

      {/* Page content */}
      <div style={{ flex: 1, overflow: "hidden" }}>{children}</div>
    </div>
  );
};

const LockIcon: React.FC = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="2" y="4.5" width="6" height="4.5" rx="1" fill="#3fb950" />
    <path
      d="M3.5 4.5V3C3.5 1.9 4.1 1 5 1C5.9 1 6.5 1.9 6.5 3V4.5"
      stroke="#3fb950"
      strokeWidth="1"
      fill="none"
    />
  </svg>
);

// Login form mockup for the record scene
export const LoginFormMock: React.FC<{
  highlightField?: "email" | "password" | "button" | null;
  showDashboard?: boolean;
}> = ({ highlightField, showDashboard }) => {
  if (showDashboard) {
    return (
      <div
        style={{
          padding: 24,
          height: "100%",
          background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #00d4ff, #0066ff)",
            }}
          />
          <span
            style={{
              color: "#e6edf3",
              fontWeight: 700,
              fontSize: 16,
              fontFamily: "sans-serif",
            }}
          >
            Dashboard
          </span>
          <div
            style={{
              marginLeft: "auto",
              width: 28,
              height: 28,
              borderRadius: "50%",
              backgroundColor: "#3fb950",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
            }}
          >
            ✓
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "Flows", val: "12", color: "#00d4ff" },
            { label: "Runs", val: "847", color: "#3fb950" },
            { label: "Pass rate", val: "99.1%", color: "#d29922" },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                flex: 1,
                backgroundColor: "#21262d",
                borderRadius: 8,
                padding: "12px 14px",
                border: `1px solid ${card.color}33`,
              }}
            >
              <div
                style={{
                  color: "#6e7681",
                  fontSize: 10,
                  fontFamily: "sans-serif",
                  marginBottom: 4,
                }}
              >
                {card.label}
              </div>
              <div
                style={{
                  color: card.color,
                  fontSize: 20,
                  fontWeight: 700,
                  fontFamily: "sans-serif",
                }}
              >
                {card.val}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 32,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
        gap: 16,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#e6edf3",
          fontFamily: "sans-serif",
          marginBottom: 4,
        }}
      >
        Sign in
      </div>

      {/* Email field */}
      <div style={{ width: "100%", maxWidth: 260 }}>
        <label
          style={{
            display: "block",
            fontSize: 11,
            color: "#8b949e",
            fontFamily: "sans-serif",
            marginBottom: 4,
          }}
        >
          Email
        </label>
        <div
          style={{
            backgroundColor: "#0d1117",
            border: `2px solid ${highlightField === "email" ? "#00d4ff" : "#30363d"}`,
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 12,
            color: highlightField === "email" ? "#e6edf3" : "#6e7681",
            fontFamily: "Menlo, monospace",
            transition: "border-color 0.2s",
          }}
        >
          {highlightField === "email" ? "user@example.com" : ""}
        </div>
      </div>

      {/* Password field */}
      <div style={{ width: "100%", maxWidth: 260 }}>
        <label
          style={{
            display: "block",
            fontSize: 11,
            color: "#8b949e",
            fontFamily: "sans-serif",
            marginBottom: 4,
          }}
        >
          Password
        </label>
        <div
          style={{
            backgroundColor: "#0d1117",
            border: `2px solid ${highlightField === "password" ? "#00d4ff" : "#30363d"}`,
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 12,
            color: "#e6edf3",
            fontFamily: "Menlo, monospace",
          }}
        >
          {highlightField === "password" ? "••••••••" : ""}
        </div>
      </div>

      {/* Submit button */}
      <div
        style={{
          width: "100%",
          maxWidth: 260,
          backgroundColor:
            highlightField === "button" ? "#1a7f37" : "#238636",
          borderRadius: 6,
          padding: "10px",
          textAlign: "center",
          fontSize: 13,
          fontWeight: 600,
          color: "#ffffff",
          fontFamily: "sans-serif",
          cursor: "pointer",
          transform: highlightField === "button" ? "scale(0.98)" : "scale(1)",
          boxShadow:
            highlightField === "button"
              ? "0 0 0 3px #3fb95044"
              : "none",
        }}
      >
        Sign in
      </div>
    </div>
  );
};
