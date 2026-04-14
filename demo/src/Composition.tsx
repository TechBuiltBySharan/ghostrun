import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Intro } from "./scenes/Intro";
import { ProblemScene } from "./scenes/ProblemScene";
import { RecordScene } from "./scenes/RecordScene";
import { RunScene } from "./scenes/RunScene";
import { ApiScene } from "./scenes/ApiScene";
import { PerfScene } from "./scenes/PerfScene";
import { McpScene } from "./scenes/McpScene";
import { CTAScene } from "./scenes/CTAScene";

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;

export const INTRO_FRAMES   = 3  * FPS; //  90
export const PROBLEM_FRAMES = 4  * FPS; // 120
export const RECORD_FRAMES  = 7  * FPS; // 210
export const RUN_FRAMES     = 5  * FPS; // 150
export const API_FRAMES     = 7  * FPS; // 210
export const PERF_FRAMES    = 5  * FPS; // 150
export const MCP_FRAMES     = 4  * FPS; // 120
export const CTA_FRAMES     = 5  * FPS; // 150

export const TOTAL_FRAMES =
  INTRO_FRAMES + PROBLEM_FRAMES + RECORD_FRAMES + RUN_FRAMES +
  API_FRAMES + PERF_FRAMES + MCP_FRAMES + CTA_FRAMES; // 1200 = 40s

const INTRO_START   = 0;
const PROBLEM_START = INTRO_START   + INTRO_FRAMES;
const RECORD_START  = PROBLEM_START + PROBLEM_FRAMES;
const RUN_START     = RECORD_START  + RECORD_FRAMES;
const API_START     = RUN_START     + RUN_FRAMES;
const PERF_START    = API_START     + API_FRAMES;
const MCP_START     = PERF_START    + PERF_FRAMES;
const CTA_START     = MCP_START     + MCP_FRAMES;

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#080c10" }}>
      <Sequence from={INTRO_START}   durationInFrames={INTRO_FRAMES}>   <Intro />       </Sequence>
      <Sequence from={PROBLEM_START} durationInFrames={PROBLEM_FRAMES}> <ProblemScene /></Sequence>
      <Sequence from={RECORD_START}  durationInFrames={RECORD_FRAMES}>  <RecordScene /> </Sequence>
      <Sequence from={RUN_START}     durationInFrames={RUN_FRAMES}>     <RunScene />    </Sequence>
      <Sequence from={API_START}     durationInFrames={API_FRAMES}>     <ApiScene />    </Sequence>
      <Sequence from={PERF_START}    durationInFrames={PERF_FRAMES}>    <PerfScene />   </Sequence>
      <Sequence from={MCP_START}     durationInFrames={MCP_FRAMES}>     <McpScene />    </Sequence>
      <Sequence from={CTA_START}     durationInFrames={CTA_FRAMES}>     <CTAScene />    </Sequence>
    </AbsoluteFill>
  );
};
