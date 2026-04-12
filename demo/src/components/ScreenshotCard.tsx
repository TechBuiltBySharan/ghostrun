import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { staticFile } from "remotion";

interface ScreenshotCardProps {
  src: string;
  label: string;
  startFrame: number;
  rotation?: number;
  offsetX?: number;
  offsetY?: number;
}

export const ScreenshotCard: React.FC<ScreenshotCardProps> = ({
  src,
  label,
  startFrame,
  rotation = 0,
  offsetX = 0,
  offsetY = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: {
      damping: 14,
      stiffness: 120,
      mass: 0.8,
    },
  });

  const opacity = interpolate(frame - startFrame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const translateY = interpolate(progress, [0, 1], [60, 0]);
  const scale = interpolate(progress, [0, 1], [0.85, 1]);

  if (frame < startFrame) return null;

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px) scale(${scale}) rotate(${rotation}deg) translateX(${offsetX}px)`,
        display: "inline-block",
      }}
    >
      {/* Polaroid card */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 4,
          padding: "8px 8px 28px 8px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
          display: "inline-block",
        }}
      >
        <img
          src={staticFile(src)}
          style={{
            display: "block",
            width: 160,
            height: 100,
            objectFit: "cover",
            borderRadius: 2,
          }}
        />
        <div
          style={{
            textAlign: "center",
            marginTop: 6,
            fontSize: 9,
            fontFamily: "Menlo, Consolas, monospace",
            color: "#555",
            letterSpacing: 0.5,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
};
