"use client";

import Link from "next/link";
import { Copy, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api/apiErrors";
import { getMyProfile } from "@/services/profileService";
import {
  createShot,
  deleteShot,
  getShot,
  listShots,
  MAX_SHOT_LABEL_LENGTH,
} from "@/services/shotsService";
import type { Shot } from "@/types/api";
import {
  applyViewMatrix,
  isViewerStarted,
  readViewMatrix,
} from "@/viewer/engine/viewer";

type ShotsPanelProps = {
  sceneId: string;
  shotId?: string | null;
  isSceneOwner?: boolean;
};

function shotShareUrl(sceneId: string, shotId: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/scenes/view?id=${encodeURIComponent(sceneId)}&shot=${encodeURIComponent(shotId)}`;
}

export default function ShotsPanel({
  sceneId,
  shotId,
  isSceneOwner = false,
}: ShotsPanelProps) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [shotLinkNotice, setShotLinkNotice] = useState<string | null>(null);

  const deepLinkAppliedRef = useRef(false);
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    void getMyProfile(ctrl.signal)
      .then((profile) => {
        if (cancelled) return;
        setMyUsername(profile.username?.trim().toLowerCase() ?? null);
      })
      .catch(() => {
        /* optional for read-only viewing */
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  const fetchShots = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setLoadError(null);
      setShots([]);
      setNextCursor(undefined);

      try {
        const res = await listShots(sceneId, undefined, signal);
        if (signal.aborted) return;
        setShots(res.shots ?? []);
        setNextCursor(res.nextCursor);
      } catch (err) {
        if (signal.aborted) return;
        const message =
          err instanceof ApiRequestError
            ? err.message
            : "Could not load shots";
        setLoadError(message);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [sceneId],
  );

  useEffect(() => {
    if (!sceneId) return;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchShots(ctrl.signal);
    return () => ctrl.abort();
  }, [sceneId, fetchShots]);

  useEffect(() => {
    if (!shotId || !sceneId || deepLinkAppliedRef.current) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tryApplyDeepLink = async () => {
      if (cancelled || deepLinkAppliedRef.current) return true;
      if (!isViewerStarted() || readViewMatrix() === null) return false;

      deepLinkAppliedRef.current = true;
      try {
        const shot = await getShot(sceneId, shotId);
        if (cancelled) return true;
        applyViewMatrix(shot.viewMatrix);
      } catch {
        if (!cancelled) {
          setShotLinkNotice("Saved view not found — showing default camera.");
        }
      }
      return true;
    };

    void tryApplyDeepLink().then((done) => {
      if (done || cancelled) return;
      timer = setInterval(() => {
        void tryApplyDeepLink().then((finished) => {
          if (finished && timer) {
            clearInterval(timer);
            timer = null;
          }
        });
      }, 200);
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [sceneId, shotId]);

  useEffect(() => {
    if (showSaveForm) labelInputRef.current?.focus();
  }, [showSaveForm]);

  const canDeleteShot = useCallback(
    (shot: Shot) => {
      if (isSceneOwner) return true;
      const creator = shot.creatorUsername.trim().toLowerCase();
      return Boolean(myUsername && creator && myUsername === creator);
    },
    [isSceneOwner, myUsername],
  );

  const openSaveForm = () => {
    if (!isViewerStarted() || readViewMatrix() === null) return;
    setSaveError(null);
    setLabelDraft("");
    setShowSaveForm(true);
  };

  const cancelSave = () => {
    setShowSaveForm(false);
    setSaveError(null);
    setLabelDraft("");
  };

  const handleSave = async () => {
    const viewMatrix = readViewMatrix();
    if (!viewMatrix) {
      setSaveError("Viewer is not ready yet.");
      return;
    }

    const label = labelDraft.trim() || "Shot";
    if (label.length > MAX_SHOT_LABEL_LENGTH) {
      setSaveError(`Label must be at most ${MAX_SHOT_LABEL_LENGTH} characters.`);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const shot = await createShot(sceneId, { label, viewMatrix });
      setShots((prev) => [shot, ...prev]);
      setShowSaveForm(false);
      setLabelDraft("");
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : "Could not save shot";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleApply = (shot: Shot) => {
    applyViewMatrix(shot.viewMatrix);
  };

  const handleCopyLink = async (shot: Shot) => {
    const url = shotShareUrl(sceneId, shot.shotId);
    try {
      await navigator.clipboard.writeText(url);
      setCopyNotice("Link copied");
      window.setTimeout(() => setCopyNotice(null), 2000);
    } catch {
      setCopyNotice("Copy failed");
      window.setTimeout(() => setCopyNotice(null), 2000);
    }
  };

  const handleDelete = async (shotIdToDelete: string) => {
    setDeletingId(shotIdToDelete);
    try {
      await deleteShot(sceneId, shotIdToDelete);
      setShots((prev) => prev.filter((s) => s.shotId !== shotIdToDelete));
    } catch {
      /* ignore — row stays */
    } finally {
      setDeletingId(null);
    }
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listShots(sceneId, nextCursor);
      setShots((prev) => [...prev, ...(res.shots ?? [])]);
      setNextCursor(res.nextCursor);
    } catch {
      /* keep existing list */
    } finally {
      setLoadingMore(false);
    }
  };

  const viewerReady = isViewerStarted() && readViewMatrix() !== null;

  return (
    <div className="shots-panel">
      <div className="shots-header">
        <span className="shots-title">Shots</span>
        {!showSaveForm ? (
          <button
            type="button"
            className="shots-btn shots-btn--save"
            disabled={!viewerReady || saving}
            onClick={openSaveForm}
          >
            Save this view
          </button>
        ) : null}
      </div>

      {showSaveForm ? (
        <form
          className="shots-save-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <input
            ref={labelInputRef}
            type="text"
            className="shots-input"
            placeholder="Label (optional)"
            maxLength={MAX_SHOT_LABEL_LENGTH}
            value={labelDraft}
            disabled={saving}
            onChange={(e) => setLabelDraft(e.target.value)}
          />
          <div className="shots-save-actions">
            <button
              type="submit"
              className="shots-btn shots-btn--save"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="shots-btn"
              disabled={saving}
              onClick={cancelSave}
            >
              Cancel
            </button>
          </div>
          {saveError ? <p className="shots-error">{saveError}</p> : null}
        </form>
      ) : null}

      {shotLinkNotice ? (
        <p className="shots-notice">{shotLinkNotice}</p>
      ) : null}
      {copyNotice ? <p className="shots-notice">{copyNotice}</p> : null}

      {loading ? (
        <div className="shots-loading">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          <span>Loading…</span>
        </div>
      ) : loadError ? (
        <p className="shots-error">{loadError}</p>
      ) : shots.length === 0 ? (
        <p className="shots-empty">No saved shots yet</p>
      ) : (
        <ul className="shots-list">
          {shots.map((shot) => {
            const handle = shot.creatorUsername.trim().toLowerCase();
            return (
              <li key={shot.shotId} className="shots-row">
                <div
                  role="button"
                  tabIndex={0}
                  className="shots-row-main"
                  onClick={() => handleApply(shot)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleApply(shot);
                    }
                  }}
                  title={`Jump to “${shot.label}”`}
                >
                  <span className="shots-label">{shot.label}</span>
                  {handle ? (
                    <Link
                      href={`/u/${encodeURIComponent(handle)}`}
                      className="shots-creator"
                      onClick={(e) => e.stopPropagation()}
                    >
                      @{handle}
                    </Link>
                  ) : (
                    <span className="shots-creator">@unknown</span>
                  )}
                </div>
                <div className="shots-row-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Copy link to this shot"
                    className="shots-icon-btn"
                    onClick={() => void handleCopyLink(shot)}
                  >
                    <Copy className="size-3" />
                  </Button>
                  {canDeleteShot(shot) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Delete shot"
                      disabled={deletingId === shot.shotId}
                      className="shots-icon-btn shots-icon-btn--delete"
                      onClick={() => void handleDelete(shot.shotId)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor && !loading ? (
        <button
          type="button"
          className="shots-btn shots-btn--load"
          disabled={loadingMore}
          onClick={() => void handleLoadMore()}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
