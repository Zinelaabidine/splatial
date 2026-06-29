"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  useCameraTrajectory,
  type TrajectoryHook,
} from "@/hooks/viewer/useCameraTrajectory";

const CameraTrajectoryContext = createContext<TrajectoryHook | null>(null);

export function CameraTrajectoryProvider({ children }: { children: ReactNode }) {
  const trajectory = useCameraTrajectory();
  return (
    <CameraTrajectoryContext.Provider value={trajectory}>
      {children}
    </CameraTrajectoryContext.Provider>
  );
}

export function useCameraTrajectoryContext(): TrajectoryHook {
  const ctx = useContext(CameraTrajectoryContext);
  if (!ctx) {
    throw new Error(
      "useCameraTrajectoryContext must be used within CameraTrajectoryProvider",
    );
  }
  return ctx;
}
