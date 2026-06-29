"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";

export default function RemixSuccessBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sceneId = searchParams.get("id") ?? "";
  const remixed = searchParams.get("remixed") === "1";
  const [dismissedForSceneId, setDismissedForSceneId] = useState<string | null>(null);
  const visible = remixed && dismissedForSceneId !== sceneId;

  const dismiss = () => {
    setDismissedForSceneId(sceneId);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("remixed");
    const query = params.toString();
    router.replace(query ? `/scenes/view?${query}` : "/scenes/view", { scroll: false });
  };

  if (!visible) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-24 z-20 mx-auto flex max-w-lg items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/90 px-4 py-3 text-sm text-emerald-100 shadow-lg backdrop-blur-md"
      role="status"
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-emerald-50">Remix created</p>
        <p className="mt-0.5 text-xs text-emerald-200/90">
          Your copy is private by default — make it public from Your Scenes when you are ready.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-emerald-300/80 transition hover:bg-emerald-900/60 hover:text-emerald-50"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
