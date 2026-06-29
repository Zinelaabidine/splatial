"use client";

import PointCloudThumbnail from "@/components/splatworks/PointCloudThumbnail";
import SceneTaxonomyDisplay from "@/components/features/scenes/SceneTaxonomyDisplay";
import { cn } from "@/lib/utils";
import type { DashboardScene } from "@/types/splatworks";

type PublicSceneCardProps = {
  scene: DashboardScene;
  onClick: (scene: DashboardScene) => void;
};

export default function PublicSceneCard({ scene, onClick }: PublicSceneCardProps) {
  const isViewable = scene.status === "completed";

  return (
    <article
      role={isViewable ? "button" : undefined}
      tabIndex={isViewable ? 0 : undefined}
      onClick={isViewable ? () => onClick(scene) : undefined}
      onKeyDown={
        isViewable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(scene);
              }
            }
          : undefined
      }
      className={cn(
        "group relative rounded-xl bg-[#212121] transition-all duration-200",
        isViewable
          ? "cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-black/40"
          : "hover:bg-[#242424]",
      )}
    >
      {scene.status === "completed" && scene.thumbnailUrl ? (
        <>
          {/* Presigned S3 URLs — not compatible with next/image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={scene.thumbnailUrl}
            alt=""
            className="h-[180px] w-full rounded-t-xl object-cover"
          />
        </>
      ) : scene.status === "completed" && scene.preview ? (
        <PointCloudThumbnail
          preview={scene.preview}
          height={180}
          variant="dark-card"
          className="rounded-t-xl"
        />
      ) : (
        <div className="flex h-[180px] items-center justify-center rounded-t-xl bg-[#2a2a2a] px-5 text-center">
          <span className="font-sw-mono text-[10px] font-semibold uppercase tracking-wider text-[#909090]">
            {scene.title}
          </span>
        </div>
      )}

      <div className="rounded-b-xl p-3">
        <h3 className="truncate text-[15px] font-semibold text-white">{scene.title}</h3>
        <SceneTaxonomyDisplay
          category={scene.category}
          tags={scene.tags}
          className="mt-1.5"
        />
        <p className="mt-1 font-sw-mono text-xs text-[#909090]">{scene.caption}</p>
      </div>
    </article>
  );
}
