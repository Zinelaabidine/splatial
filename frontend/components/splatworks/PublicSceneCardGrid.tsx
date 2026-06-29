"use client";

import { Loader2 } from "lucide-react";

import PublicSceneCard from "@/components/splatworks/PublicSceneCard";
import { Button } from "@/components/ui/button";
import type { PublicSceneListItem } from "@/lib/scenes/feedSceneMappers";
import type { DashboardScene } from "@/types/splatworks";

type PublicSceneCardGridProps = {
  items: PublicSceneListItem[];
  onSceneClick: (scene: DashboardScene) => void;
  nextCursor?: string;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

export default function PublicSceneCardGrid({
  items,
  onSceneClick,
  nextCursor,
  loadingMore = false,
  onLoadMore,
}: PublicSceneCardGridProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <PublicSceneCard
            key={item.scene.id}
            scene={item.scene}
            onClick={onSceneClick}
            ownerUsername={item.ownerUsername}
            ownerDisplayName={item.ownerDisplayName}
            ownerAvatarUrl={item.ownerAvatarUrl}
          />
        ))}
      </div>

      {nextCursor ? (
        <div className="mt-8 flex justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={loadingMore}
            onClick={() => onLoadMore?.()}
          >
            {loadingMore ? (
              <>
                <Loader2 className="animate-spin" />
                Loading…
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      ) : null}
    </>
  );
}
