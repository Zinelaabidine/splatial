import type { DashboardScene } from "@/types/splatial";

function engagementScore(scene: DashboardScene): number {
  return (
    (scene.reactionsTotal ?? 0) +
    (scene.commentsCount ?? 0) * 2 +
    (scene.forksCount ?? 0) * 3
  );
}

/** Pick the best completed scene to highlight — highest engagement, then newest. */
export function pickFeaturedScene(
  scenes: DashboardScene[],
): DashboardScene | null {
  const completed = scenes.filter((s) => s.status === "completed");
  if (completed.length === 0) return null;

  return completed.reduce((best, scene) => {
    const bestScore = engagementScore(best);
    const sceneScore = engagementScore(scene);
    if (sceneScore > bestScore) return scene;
    if (sceneScore < bestScore) return best;
    return (scene.createdAtIso ?? "") > (best.createdAtIso ?? "") ? scene : best;
  }, completed[0]);
}

export function computeDashboardStats(scenes: DashboardScene[]) {
  const trainingNow = scenes.filter(
    (s) => s.status === "training" || s.status === "queued",
  ).length;
  const ready = scenes.filter((s) => s.status === "completed").length;
  const publicCount = scenes.filter((s) => s.visibility === "PUBLIC").length;

  return {
    total: scenes.length,
    trainingNow,
    ready,
    publicCount,
  };
}
