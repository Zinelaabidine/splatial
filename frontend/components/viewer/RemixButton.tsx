"use client";

import { useCallback, useState } from "react";
import { GitFork, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api/apiErrors";
import { sceneViewerUrl } from "@/lib/scenes/viewerUrls";
import { forkScene } from "@/services/scenesService";
import { cn } from "@/lib/utils";

type RemixButtonProps = {
  sceneId: string;
  sceneName?: string;
};

function mapForkError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.statusCode === 409) {
      return "This scene isn't ready to remix yet. Try again once processing finishes.";
    }
    if (err.statusCode === 403) {
      return "You can't remix this scene.";
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Could not remix this scene. Please try again.";
}

export default function RemixButton({ sceneId, sceneName }: RemixButtonProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [forking, setForking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultName = sceneName?.trim()
    ? `Fork of ${sceneName.trim()}`
    : "";

  const openModal = useCallback(() => {
    setName(defaultName);
    setError(null);
    setModalOpen(true);
  }, [defaultName]);

  const closeModal = useCallback(() => {
    if (forking) return;
    setModalOpen(false);
    setError(null);
  }, [forking]);

  const handleFork = useCallback(async () => {
    if (forking) return;

    setForking(true);
    setError(null);

    try {
      const trimmed = name.trim();
      const forked = await forkScene(
        sceneId,
        trimmed !== "" ? trimmed : undefined,
      );
      setModalOpen(false);
      router.push(
        sceneViewerUrl(forked.sceneId, {
          remixed: true,
          forkedFromSceneId: forked.forkedFromSceneId,
          forkedFromUsername: forked.forkedFromUsername,
        }),
      );
    } catch (err) {
      setError(mapForkError(err));
    } finally {
      setForking(false);
    }
  }, [forking, name, router, sceneId]);

  return (
    <>
      <div className="pointer-events-auto flex flex-col items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={forking}
          aria-label="Remix scene"
          title="Remix"
          onClick={openModal}
          className={cn(
            "h-auto gap-1.5 rounded-full border border-[var(--nord-hairline)] bg-[var(--nord-scrim)] px-3 py-2 text-[var(--nord-cta-fg)] shadow-lg backdrop-blur-md hover:bg-[var(--nord-tint)]",
            forking && "opacity-70",
          )}
        >
          {forking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GitFork className="h-4 w-4" strokeWidth={1.75} />
          )}
          <span className="text-xs font-medium">{forking ? "Remixing…" : "Remix"}</span>
        </Button>
      </div>

      {modalOpen ? (
        <div
          className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-[var(--nord-scrim)] p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remix-scene-title"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--nord-hairline)] bg-[var(--nord-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-[var(--nord-hairline)] px-5 py-4">
              <div>
                <h2 id="remix-scene-title" className="text-base font-semibold text-[var(--nord-ink)]">
                  Remix scene
                </h2>
                <p className="mt-0.5 text-xs text-[var(--nord-slate)]">
                  Creates a copy in your account (private by default).
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={forking}
                aria-label="Close"
                className="rounded-lg p-1.5 text-[var(--nord-slate)] transition-colors hover:bg-[var(--nord-surface)] hover:text-[var(--nord-ink)] disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="remix-scene-name" className="text-xs font-medium text-[var(--nord-ink)]">
                  Name (optional)
                </label>
                <input
                  id="remix-scene-name"
                  type="text"
                  value={name}
                  disabled={forking}
                  placeholder={defaultName || "Fork of …"}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3 py-2 text-sm text-[var(--nord-ink)] outline-none transition focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/20 disabled:opacity-50"
                />
              </div>

              {error ? (
                <p className="text-sm text-[var(--nord-danger)]" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <footer className="flex justify-end gap-2 border-t border-[var(--nord-hairline)] px-5 py-4">
              <Button
                type="button"
                variant="outline"
                disabled={forking}
                onClick={closeModal}
                className="border-[var(--nord-hairline)] bg-transparent text-[var(--nord-ink)] hover:bg-[var(--nord-surface)] hover:text-[var(--nord-ink)]"
              >
                Cancel
              </Button>
              <Button type="button" disabled={forking} onClick={() => void handleFork()}>
                {forking ? (
                  <>
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                    Remixing…
                  </>
                ) : (
                  "Create remix"
                )}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
