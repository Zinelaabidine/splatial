"use client";

import SculptureViewport from "@/components/dashboard/SculptureViewport";

type ViewerModeProps = {
  sceneTitle: string;
};

export default function ViewerMode({ sceneTitle }: ViewerModeProps) {
  return (
    <div className="h-full w-full">
      <SculptureViewport title={sceneTitle} />
    </div>
  );
}
