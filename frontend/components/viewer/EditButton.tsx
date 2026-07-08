"use client";

import { useCallback } from "react";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { sceneEditUrl } from "@/lib/scenes/viewerUrls";
import { setSplatBuffer } from "@/lib/viewer/splatBufferCache";
import { cn } from "@/lib/utils";
import { getViewerSplatBuffer } from "@/viewer/engine/viewer";

type EditButtonProps = {
  sceneId: string;
};

/** Navigates to the splat editor, reusing the viewer's loaded buffer when available. */
export default function EditButton({ sceneId }: EditButtonProps) {
  const router = useRouter();

  const handleEdit = useCallback(() => {
    const buffer = getViewerSplatBuffer();
    if (buffer) {
      setSplatBuffer(sceneId, buffer);
    }
    router.push(sceneEditUrl(sceneId));
  }, [router, sceneId]);

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Edit scene"
        title="Edit"
        onClick={handleEdit}
        className={cn(
          "h-auto gap-1.5 rounded-full border border-white/10 bg-black/70 px-3 py-2 text-white shadow-lg backdrop-blur-md hover:bg-white/10",
        )}
      >
        <Pencil className="h-4 w-4" strokeWidth={1.75} />
        <span className="text-xs font-medium">Edit</span>
      </Button>
    </div>
  );
}
