"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSceneViewUrl } from "@/hooks/viewer/useSceneViewUrl";
import { splatFilenameFromUrl } from "@/lib/viewer/splatFilenameFromUrl";
import { completeSceneEdit, presignSceneEdit } from "@/services/scenesService";

type SaveState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "completing" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export type SplatLoadState =
  | { kind: "waiting-for-editor" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

/** Messages received from the embedded splat editor iframe. */
type EditorMessage =
  | { type: "save-complete"; key: string }
  | { type: "save-error"; message: string }
  | { type: "studio-ready" }
  | { type: "load-splat-complete" }
  | { type: "load-splat-error"; message: string };

function isEditorMessage(data: unknown): data is EditorMessage {
  if (typeof data !== "object" || data === null) return false;
  const t = (data as { type?: unknown }).type;
  return (
    t === "save-complete" ||
    t === "save-error" ||
    t === "studio-ready" ||
    t === "load-splat-complete" ||
    t === "load-splat-error"
  );
}

type StudioEditorFrameProps = {
  sceneId: string;
  splatUrl: string;
  studioOrigin: string;
  editorSrc: string;
  onLoadStateChange: (state: SplatLoadState) => void;
  onEditorMessage: (msg: EditorMessage) => void;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
};

function StudioEditorFrame({
  splatUrl,
  studioOrigin,
  editorSrc,
  onLoadStateChange,
  onEditorMessage,
  iframeRef,
}: StudioEditorFrameProps) {
  const [splatLoadState, setSplatLoadState] = useState<SplatLoadState>({
    kind: "waiting-for-editor",
  });

  useEffect(() => {
    onLoadStateChange(splatLoadState);
  }, [onLoadStateChange, splatLoadState]);

  const postToEditor = useCallback(
    (message: unknown, transfer?: Transferable[]) => {
      iframeRef.current?.contentWindow?.postMessage(
        message,
        studioOrigin,
        transfer,
      );
    },
    [iframeRef, studioOrigin],
  );

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== studioOrigin) return;
      if (!isEditorMessage(event.data)) return;

      const msg = event.data;
      if (msg.type === "studio-ready") {
        setSplatLoadState({ kind: "loading" });
        return;
      }

      if (msg.type === "load-splat-complete") {
        setSplatLoadState({ kind: "ready" });
        return;
      }

      if (msg.type === "load-splat-error") {
        setSplatLoadState({ kind: "error", message: msg.message });
        return;
      }

      onEditorMessage(msg);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onEditorMessage, studioOrigin]);

  useEffect(() => {
    if (splatLoadState.kind !== "loading") return;

    let cancelled = false;
    const ctrl = new AbortController();

    void (async () => {
      try {
        const resp = await fetch(splatUrl, {
          mode: "cors",
          credentials: "omit",
          signal: ctrl.signal,
        });
        if (!resp.ok) {
          throw new Error(`Could not fetch splat (${resp.status})`);
        }

        const buffer = await resp.arrayBuffer();
        if (cancelled) return;

        postToEditor(
          {
            type: "load-splat",
            filename: splatFilenameFromUrl(splatUrl),
            buffer,
          },
          [buffer],
        );
      } catch (err) {
        if (cancelled || ctrl.signal.aborted) return;
        setSplatLoadState({
          kind: "error",
          message:
            err instanceof Error ? err.message : "Could not load splat for editing.",
        });
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [postToEditor, splatLoadState.kind, splatUrl]);

  return (
    <iframe
      ref={iframeRef}
      src={editorSrc}
      title="Splat editor"
      className="h-full w-full border-0"
      allow="cross-origin-isolated"
    />
  );
}

/**
 * Full-page splat editor host. Loads the scene's current splat into the
 * self-hosted editor at /studio via postMessage (presigned URLs are too long
 * and fragile in query strings), and drives the save round trip (presign ->
 * editor PUTs to S3 -> complete repoints ply_key) over postMessage. Cancel is
 * purely client-side — nothing is written to the server until a save completes.
 */
export default function EditScenePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sceneId = searchParams.get("id") ?? "";

  const { splatUrl, sceneName, error, loading } = useSceneViewUrl(sceneId);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [splatLoadState, setSplatLoadState] = useState<SplatLoadState>({
    kind: "waiting-for-editor",
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const studioOrigin =
    typeof window !== "undefined" ? window.location.origin : "";

  const postToEditor = useCallback(
    (message: unknown, transfer?: Transferable[]) => {
      iframeRef.current?.contentWindow?.postMessage(
        message,
        studioOrigin,
        transfer,
      );
    },
    [studioOrigin],
  );

  const handleEditorMessage = useCallback(
    (msg: EditorMessage) => {
      if (msg.type === "save-complete") {
        setSaveState({ kind: "completing" });
        void (async () => {
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
        })();
        return;
      }

      if (msg.type === "save-error") {
        setSaveState({ kind: "error", message: msg.message });
      }
    },
    [router, sceneId],
  );

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

  const editorSrc = studioOrigin
    ? `/studio/index.html?sceneId=${encodeURIComponent(sceneId)}&parentOrigin=${encodeURIComponent(studioOrigin)}`
    : "";

  const splatLoading =
    splatLoadState.kind === "waiting-for-editor" ||
    splatLoadState.kind === "loading";

  const displayError =
    error ??
    (splatLoadState.kind === "error" ? splatLoadState.message : null);

  const loadSessionKey = `${sceneId}:${splatUrl ?? ""}`;

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
            {splatLoading && (
              <span className="inline-flex items-center gap-1.5 text-slate-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading splat…
              </span>
            )}
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
            disabled={saving || !splatUrl || splatLoadState.kind !== "ready"}
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
            <p className="text-sm text-slate-400">Loading scene…</p>
          </div>
        ) : displayError ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="text-sm text-red-400">{displayError}</p>
          </div>
        ) : editorSrc && splatUrl ? (
          <StudioEditorFrame
            key={loadSessionKey}
            sceneId={sceneId}
            splatUrl={splatUrl}
            studioOrigin={studioOrigin}
            editorSrc={editorSrc}
            onLoadStateChange={setSplatLoadState}
            onEditorMessage={handleEditorMessage}
            iframeRef={iframeRef}
          />
        ) : null}
      </div>
    </div>
  );
}
