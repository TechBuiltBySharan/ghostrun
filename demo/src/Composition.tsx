import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { Intro } from "./scenes/Intro";
import { ProblemScene } from "./scenes/ProblemScene";
import { RecordScene } from "./scenes/RecordScene";
import { RunScene } from "./scenes/RunScene";
import { ChatScene } from "./scenes/ChatScene";
import { CTAScene } from "./scenes/CTAScene";

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;

// Scene durations in frames (30fps)
// Scene 1 — Intro:        0–4s     (frames 0–120)
// Scene 2 — Problem/Hook: 4–8s     (frames 120–240)
// Scene 3 — Record:       8–14s    (frames 240–420)
// Scene 4 — Run:          14–20s   (frames 420–600)
// Scene 5 — Chat:         20–25s   (frames 600–750)
// Scene 6 — CTA:          25–30s   (frames 750–900)

export const INTRO_FRAMES   = 4 * FPS;  // 120
export const PROBLEM_FRAMES = 4 * FPS;  // 120
export const RECORD_FRAMES  = 6 * FPS;  // 180
export const RUN_FRAMES     = 6 * FPS;  // 180
export const CHAT_FRAMES    = 5 * FPS;  // 150
export const CTA_FRAMES     = 5 * FPS;  // 150

export const TOTAL_FRAMES =
  INTRO_FRAMES +
  PROBLEM_FRAMES +
  RECORD_FRAMES +
  RUN_FRAMES +
  CHAT_FRAMES +
  CTA_FRAMES; // = 900

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#080c10" }}>
      <Series>
        {/* Scene 1: Intro */}
        <Series.Sequence durationInFrames={INTRO_FRAMES}>
          <Intro />
        </Series.Sequence>

        {/* Scene 2: Problem / Hook */}
        <Series.Sequence durationInFrames={PROBLEM_FRAMES}>
          <ProblemScene />
        </Series.Sequence>

        {/* Scene 3: Record */}
        <Series.Sequence durationInFrames={RECORD_FRAMES}>
          <RecordScene />
        </Series.Sequence>

        {/* Scene 4: Run */}
        <Series.Sequence durationInFrames={RUN_FRAMES}>
          <RunScene />
        </Series.Sequence>

        {/* Scene 5: Chat */}
        <Series.Sequence durationInFrames={CHAT_FRAMES}>
          <ChatScene />
        </Series.Sequence>

        {/* Scene 6: CTA */}
        <Series.Sequence durationInFrames={CTA_FRAMES}>
          <CTAScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
