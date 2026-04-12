import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Intro } from "./scenes/Intro";
import { ProblemScene } from "./scenes/ProblemScene";
import { RecordScene } from "./scenes/RecordScene";
import { RunScene } from "./scenes/RunScene";
import { ChatScene } from "./scenes/ChatScene";
import { CTAScene } from "./scenes/CTAScene";

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;

export const INTRO_FRAMES   = 4  * FPS; // 120
export const PROBLEM_FRAMES = 4  * FPS; // 120
export const RECORD_FRAMES  = 6  * FPS; // 180
export const RUN_FRAMES     = 6  * FPS; // 180
export const CHAT_FRAMES    = 5  * FPS; // 150
export const CTA_FRAMES     = 5  * FPS; // 150

export const TOTAL_FRAMES =
  INTRO_FRAMES + PROBLEM_FRAMES + RECORD_FRAMES + RUN_FRAMES + CHAT_FRAMES + CTA_FRAMES; // 900

const INTRO_START   = 0;
const PROBLEM_START = INTRO_START   + INTRO_FRAMES;
const RECORD_START  = PROBLEM_START + PROBLEM_FRAMES;
const RUN_START     = RECORD_START  + RECORD_FRAMES;
const CHAT_START    = RUN_START     + RUN_FRAMES;
const CTA_START     = CHAT_START    + CHAT_FRAMES;

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#080c10" }}>
      <Sequence from={INTRO_START} durationInFrames={INTRO_FRAMES}>
        <Intro />
      </Sequence>
      <Sequence from={PROBLEM_START} durationInFrames={PROBLEM_FRAMES}>
        <ProblemScene />
      </Sequence>
      <Sequence from={RECORD_START} durationInFrames={RECORD_FRAMES}>
        <RecordScene />
      </Sequence>
      <Sequence from={RUN_START} durationInFrames={RUN_FRAMES}>
        <RunScene />
      </Sequence>
      <Sequence from={CHAT_START} durationInFrames={CHAT_FRAMES}>
        <ChatScene />
      </Sequence>
      <Sequence from={CTA_START} durationInFrames={CTA_FRAMES}>
        <CTAScene />
      </Sequence>
    </AbsoluteFill>
  );
};
