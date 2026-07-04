"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSceneViewUrl } from "@/hooks/viewer/useSceneViewUrl";
import { completeSceneEdit, presignSceneEdit } from "@/services/scenesService";

type SaveState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "completing" }
  | { kind: "done" }
  | { kind: "error"; message: string };

/** Messages received from the embedded splat editor iframe. */
type EditorMessage =
  | { type: "save-complete"; key: string }
  | { type: "save-error"; message: string };

function isEditorMessage(data: unknown): data is EditorMessage {
  if (typeof data !== "object" || data === null) return false;
  const t = (data as { type?: unknown }).type;
  return t === "save-complete" || t === "save-error";
}

/**
 * Full-page splat editor host. Loads the scene's current splat into the
 * self-hosted editor at /studio via its ?load= param, and drives the
 * save round trip (presign -> editor PUTs to S3 -> complete repoints ply_key)
 * over postMessage. Cancel is purely client-side — nothing is written to the
 * server until a save completes.
 */
export default function EditScenePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sceneId = searchParams.get("id") ?? "";

  const { splatUrl, sceneName, error, loading } = useSceneViewUrl(sceneId);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const studioOrigin =
    typeof window !== "undefined" ? window.location.origin : "";

  const postToEditor = useCallback(
    (message: unknown) => {
      iframeRef.current?.contentWindow?.postMessage(message, studioOrigin);
    },
    [studioOrigin],
  );

  useEffect(() => {
    if (!sceneId) return;

    async function handleMessage(event: MessageEvent) {
      // Only trust messages from our own origin (the /studio iframe).
      if (event.origin !== studioOrigin) return;
      if (!isEditorMessage(event.data)) return;

      const msg = event.data;
      if (msg.type === "save-complete") {
        setSaveState({ kind: "completing" });
        try {
          await completeSceneEdit(sceneId, msg.key);
          setSaveState({ kind: "done" });
          setTimeout(() => router.push(`/scenes/view?id=${sceneId}`), 900);
        } catch (err) {
          setSaveState({
            kind: "error",
            message:
              err instanceof Error ? err.message : "Could not finalize save.",
          });
        }
      } else if (msg.type === "save-error") {
        setSaveState({ kind: "error", message: msg.message });
      }
    }

    const listener = (e: MessageEvent) => void handleMessage(e);
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [sceneId, studioOrigin, router]);

  // Save is host-driven: presign a target, then hand it to the editor, which
  // serializes the current splat and PUTs it straight to S3.
  const handleSave = useCallback(async () => {
    if (!sceneId) return;
    setSaveState({ kind: "uploading" });
    try {
      const { putUrl, key } = await presignSceneEdit(sceneId);
      postToEditor({ type: "save-target", putUrl, key });
    } catch (err) {
      setSaveState({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not start save.",
      });
    }
  }, [sceneId, postToEditor]);

  const cancel = useCallback(() => {
    router.push("/scenes");
  }, [router]);

  const saving =
    saveState.kind === "uploading" || saveState.kind === "completing";

  const editorSrc =
    splatUrl && studioOrigin
      ? `/studio/index.html?load=${encodeURIComponent(splatUrl)}&sceneId=${encodeURIComponent(
          sceneId,
        )}&parentOrigin=${encodeURIComponent(studioOrigin)}`
      : "";

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[480px] flex-col bg-[#0f0f0f]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={cancel}
            className="text-slate-200 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Cancel
          </Button>
          <span className="truncate text-sm font-medium text-slate-200">
            Editing: {sceneName ?? "scene"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400" aria-live="polite">
            {saveState.kind === "uploading" && (
              <span className="inline-flex items-center gap-1.5 text-slate-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </span>
            )}
            {saveState.kind === "completing" && (
              <span className="inline-flex items-center gap-1.5 text-slate-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finalizing…
              </span>
            )}
            {saveState.kind === "done" && (
              <span className="text-emerald-400">Saved — opening viewer…</span>
            )}
            {saveState.kind === "error" && (
              <span className="text-red-400">Save failed: {saveState.message}</span>
            )}
          </span>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !splatUrl}
            className="bg-purple-600 text-white hover:bg-purple-700"
          >
            <Save className="mr-1.5 h-4 w-4" />
            Save to Splatial
          </Button>
        </div>
      </header>

      <div className="relative flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-400">Loading splat…</p>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : editorSrc ? (
          <iframe
            ref={iframeRef}
            src={editorSrc}
            title="Splat editor"
            className="h-full w-full border-0"
            allow="cross-origin-isolated"
          />
        ) : null}
      </div>
    </div>
  );
}
