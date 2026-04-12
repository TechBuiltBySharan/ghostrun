import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

interface TerminalLine {
  text: string;
  color?: string;
  delay?: number; // in frames before this line starts typing
  instant?: boolean; // show all at once (for separator lines etc)
}

interface TerminalProps {
  lines: TerminalLine[];
  style?: React.CSSProperties;
  charsPerFrame?: number;
}

const COLORS = {
  cyan: "#00d4ff",
  green: "#3fb950",
  red: "#f85149",
  amber: "#d29922",
  text: "#e6edf3",
  dim: "#6e7681",
  white: "#ffffff",
};

function resolveColor(color: string | undefined): string {
  if (!color) return COLORS.text;
  return (COLORS as Record<string, string>)[color] ?? color;
}

export const Terminal: React.FC<TerminalProps> = ({
  lines,
  style,
  charsPerFrame = 3,
}) => {
  const frame = useCurrentFrame();

  // Build rendered lines considering per-line delays and typing speed
  let cursor = 0; // tracks global character budget
  const rendered: { text: string; color: string; done: boolean }[] = [];

  for (const line of lines) {
    const lineDelay = line.delay ?? 0;

    if (line.instant) {
      // Show line all at once after its delay
      if (frame >= lineDelay) {
        rendered.push({
          text: line.text,
          color: resolveColor(line.color),
          done: true,
        });
      }
      cursor = lineDelay + 1;
      continue;
    }

    const startFrame = Math.max(cursor, lineDelay);
    const charsAvailable = Math.max(0, (frame - startFrame) * charsPerFrame);
    const visibleChars = Math.min(line.text.length, charsAvailable);

    if (frame >= startFrame) {
      rendered.push({
        text: line.text.slice(0, visibleChars),
        color: resolveColor(line.color),
        done: visibleChars >= line.text.length,
      });
    }

    // Next line can start after this one finishes typing
    const lineDuration = Math.ceil(line.text.length / charsPerFrame);
    cursor = startFrame + lineDuration + 2; // +2 frames pause between lines
  }

  return (
    <div
      style={{
        backgroundColor: "#161b22",
        borderRadius: 8,
        padding: "20px 24px",
        fontFamily: "Menlo, Consolas, 'Courier New', monospace",
        fontSize: 13,
        lineHeight: 1.7,
        color: COLORS.text,
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Terminal chrome */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 16,
          alignItems: "center",
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
            color: COLORS.dim,
            fontSize: 11,
          }}
        >
          ghostrun — zsh
        </span>
      </div>

      {/* Lines */}
      <div>
        {rendered.map((line, i) => (
          <div key={i} style={{ color: line.color, minHeight: "1.7em" }}>
            {line.text}
            {/* Blinking cursor on last active line */}
            {i === rendered.length - 1 && !line.done && (
              <span
                style={{
                  display: "inline-block",
                  width: 7,
                  height: "1em",
                  backgroundColor: COLORS.cyan,
                  marginLeft: 1,
                  verticalAlign: "text-bottom",
                  opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// A simpler terminal that accepts pre-computed visible text
export const StaticTerminal: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  title?: string;
}> = ({ children, style, title = "ghostrun — zsh" }) => {
  return (
    <div
      style={{
        backgroundColor: "#161b22",
        borderRadius: 8,
        padding: "20px 24px",
        fontFamily: "Menlo, Consolas, 'Courier New', monospace",
        fontSize: 13,
        lineHeight: 1.7,
        color: "#e6edf3",
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 16,
          alignItems: "center",
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
        <span style={{ marginLeft: 8, color: "#6e7681", fontSize: 11 }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
};
