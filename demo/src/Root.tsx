import React from "react";
import { Composition } from "remotion";
import { registerRoot } from "remotion";
import { MainVideo, TOTAL_FRAMES, FPS, WIDTH, HEIGHT } from "./Composition";

const Root: React.FC = () => {
  return (
    <Composition
      id="GhostRunDemo"
      component={MainVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};

registerRoot(Root);
