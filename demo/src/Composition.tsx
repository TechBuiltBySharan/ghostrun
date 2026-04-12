import React from "react";
import { Composition as RemotionComposition, AbsoluteFill, Series } from "remotion";
import { Intro } from "./scenes/Intro";
import { RecordScene } from "./scenes/RecordScene";
import { RunScene } from "./scenes/RunScene";
import { AIScene } from "./scenes/AIScene";
import { CTA } from "./scenes/CTA";

const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;

// Scene durations in frames
const INTRO_FRAMES = 3 * FPS;       // 0-3s
const RECORD_FRAMES = 6 * FPS;      // 3-9s
const RUN_FRAMES = 7 * FPS;         // 9-16s
const AI_FRAMES = 6 * FPS;          // 16-22s
const CTA_FRAMES = 3 * FPS;         // 22-25s

const TOTAL_FRAMES =
  INTRO_FRAMES + RECORD_FRAMES + RUN_FRAMES + AI_FRAMES + CTA_FRAMES;

const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0d1117" }}>
      <Series>
        <Series.Sequence durationInFrames={INTRO_FRAMES}>
          <Intro />
        </Series.Sequence>
        <Series.Sequence durationInFrames={RECORD_FRAMES}>
          <RecordScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={RUN_FRAMES}>
          <RunScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={AI_FRAMES}>
          <AIScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={CTA_FRAMES}>
          <CTA />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

export const Composition: React.FC = () => {
  return (
    <RemotionComposition
      id="FlowMindDemo"
      component={MainVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
