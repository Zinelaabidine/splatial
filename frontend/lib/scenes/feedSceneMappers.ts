import { apiSceneToDashboardScene } from "@/lib/scenes/sceneMappers";
import type { FeedScene } from "@/types/api";
import type { DashboardScene } from "@/types/splatworks";

export type PublicSceneListItem = {
  scene: DashboardScene;
  ownerUsername: string;
  ownerDisplayName: string;
  ownerAvatarUrl?: string | null;
};

export function feedSceneToListItem(feedScene: FeedScene): PublicSceneListItem {
  return {
    scene: apiSceneToDashboardScene(feedScene),
    ownerUsername: feedScene.ownerUsername,
    ownerDisplayName: feedScene.ownerDisplayName,
    ownerAvatarUrl: feedScene.ownerAvatarUrl,
  };
}
