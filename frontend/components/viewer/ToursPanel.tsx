"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Loader2,
  Play,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useCameraTrajectoryContext } from "@/hooks/viewer/CameraTrajectoryContext";
import { tourToKeyframes } from "@/lib/tourKeyframes";
import { ApiRequestError } from "@/lib/api/apiErrors";
import { getMyProfile } from "@/services/profileService";
import { listShots } from "@/services/shotsService";
import {
  createTour,
  deleteTour,
  getTour,
  listTours,
  MAX_TOUR_ITEMS,
  MAX_TOUR_TITLE_LENGTH,
  MIN_SEGMENT_DURATION_MS,
  MAX_SEGMENT_DURATION_MS,
  DEFAULT_SEGMENT_DURATION_MS,
  MIN_TOUR_ITEMS,
} from "@/services/toursService";
import type { Shot, Tour } from "@/types/api";
import {
  isViewerStarted,
  readViewMatrix,
} from "@/viewer/engine/viewer";

type ToursPanelProps = {
  sceneId: string;
  tourId?: string | null;
  isSceneOwner?: boolean;
};

type TourStopDraft = {
  clientId: string;
  matrix: number[];
  label: string;
};

function tourShareUrl(sceneId: string, tourId: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/scenes/view?id=${encodeURIComponent(sceneId)}&tour=${encodeURIComponent(tourId)}`;
}

function clampSegmentSeconds(seconds: number): number {
  const minS = MIN_SEGMENT_DURATION_MS / 1000;
  const maxS = MAX_SEGMENT_DURATION_MS / 1000;
  return Math.min(maxS, Math.max(minS, seconds));
}

function segmentSecondsToMs(seconds: number): number {
  return Math.round(clampSegmentSeconds(seconds) * 1000);
}

export default function ToursPanel({
  sceneId,
  tourId,
  isSceneOwner = false,
}: ToursPanelProps) {
  const trajectory = useCameraTrajectoryContext();

  const [tours, setTours] = useState<Tour[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [tourLinkNotice, setTourLinkNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [playingTourId, setPlayingTourId] = useState<string | null>(null);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [segmentSeconds, setSegmentSeconds] = useState(
    DEFAULT_SEGMENT_DURATION_MS / 1000,
  );
  const [stops, setStops] = useState<TourStopDraft[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [availableShots, setAvailableShots] = useState<Shot[]>([]);
  const [shotsLoading, setShotsLoading] = useState(false);

  const deepLinkAppliedRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

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

  const fetchTours = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setLoadError(null);
      setTours([]);
      setNextCursor(undefined);

      try {
        const res = await listTours(sceneId, undefined, signal);
        if (signal.aborted) return;
        setTours(res.tours ?? []);
        setNextCursor(res.nextCursor);
      } catch (err) {
        if (signal.aborted) return;
        const message =
          err instanceof ApiRequestError
            ? err.message
            : "Could not load tours";
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
    void fetchTours(ctrl.signal);
    return () => ctrl.abort();
  }, [sceneId, fetchTours]);

  const playTour = useCallback(
    (tour: Tour) => {
      if (tour.items.length < MIN_TOUR_ITEMS) return;
      if (trajectory.status === "playing") {
        trajectory.stopPlayback();
      }
      const keyframes = tourToKeyframes(tour.items, tour.segmentDurationMs);
      setPlayingTourId(tour.tourId);
      trajectory.playKeyframes(keyframes, () => {
        setPlayingTourId(null);
      });
    },
    [trajectory],
  );

  useEffect(() => {
    if (!tourId || !sceneId || deepLinkAppliedRef.current) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tryAutoPlay = async () => {
      if (cancelled || deepLinkAppliedRef.current) return true;
      if (!isViewerStarted() || readViewMatrix() === null) return false;

      deepLinkAppliedRef.current = true;
      try {
        const tour = await getTour(sceneId, tourId);
        if (cancelled) return true;
        playTour(tour);
      } catch {
        if (!cancelled) {
          setTourLinkNotice("Tour not found — showing default camera.");
        }
      }
      return true;
    };

    void tryAutoPlay().then((done) => {
      if (done || cancelled) return;
      timer = setInterval(() => {
        void tryAutoPlay().then((finished) => {
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
  }, [sceneId, tourId, playTour]);

  useEffect(() => {
    if (builderOpen) titleInputRef.current?.focus();
  }, [builderOpen]);

  const canDeleteTour = useCallback(
    (tour: Tour) => {
      if (isSceneOwner) return true;
      const creator = tour.creatorUsername.trim().toLowerCase();
      return Boolean(myUsername && creator && myUsername === creator);
    },
    [isSceneOwner, myUsername],
  );

  const openBuilder = () => {
    setSaveError(null);
    setTitleDraft("");
    setSegmentSeconds(DEFAULT_SEGMENT_DURATION_MS / 1000);
    setStops([]);
    setBuilderOpen(true);
    setShotsLoading(true);
    void listShots(sceneId)
      .then((res) => {
        setAvailableShots(res.shots ?? []);
      })
      .catch(() => {
        setAvailableShots([]);
      })
      .finally(() => {
        setShotsLoading(false);
      });
  };

  const closeBuilder = () => {
    setBuilderOpen(false);
    setSaveError(null);
    setStops([]);
  };

  const addStopFromMatrix = (matrix: number[], label: string) => {
    if (stops.length >= MAX_TOUR_ITEMS) return;
    setStops((prev) => [
      ...prev,
      {
        clientId: crypto.randomUUID(),
        matrix,
        label: label.trim() || `Stop ${prev.length + 1}`,
      },
    ]);
  };

  const captureCurrentView = () => {
    const matrix = readViewMatrix();
    if (!matrix) return;
    addStopFromMatrix(matrix, `Stop ${stops.length + 1}`);
  };

  const addStopFromShot = (shot: Shot) => {
    addStopFromMatrix(shot.viewMatrix, shot.label);
  };

  const moveStop = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= stops.length) return;
    setStops((prev) => {
      const copy = [...prev];
      const tmp = copy[index];
      copy[index] = copy[next];
      copy[next] = tmp;
      return copy;
    });
  };

  const removeStop = (clientId: string) => {
    setStops((prev) => prev.filter((s) => s.clientId !== clientId));
  };

  const handleSaveTour = async () => {
    const title = titleDraft.trim();
    if (!title) {
      setSaveError("Title is required.");
      return;
    }
    if (title.length > MAX_TOUR_TITLE_LENGTH) {
      setSaveError(
        `Title must be at most ${MAX_TOUR_TITLE_LENGTH} characters.`,
      );
      return;
    }
    if (stops.length < MIN_TOUR_ITEMS) {
      setSaveError(`Add at least ${MIN_TOUR_ITEMS} stops.`);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const tour = await createTour(sceneId, {
        title,
        segmentDurationMs: segmentSecondsToMs(segmentSeconds),
        items: stops.map((stop) => ({
          matrix: stop.matrix,
          ...(stop.label.trim() !== "" ? { label: stop.label.trim() } : {}),
        })),
      });
      setTours((prev) => [tour, ...prev]);
      closeBuilder();
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : "Could not save tour";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = async (tour: Tour) => {
    const url = tourShareUrl(sceneId, tour.tourId);
    try {
      await navigator.clipboard.writeText(url);
      setCopyNotice("Link copied");
      window.setTimeout(() => setCopyNotice(null), 2000);
    } catch {
      setCopyNotice("Copy failed");
      window.setTimeout(() => setCopyNotice(null), 2000);
    }
  };

  const handleDelete = async (tourIdToDelete: string) => {
    setDeletingId(tourIdToDelete);
    try {
      await deleteTour(sceneId, tourIdToDelete);
      setTours((prev) => prev.filter((t) => t.tourId !== tourIdToDelete));
      if (playingTourId === tourIdToDelete) {
        trajectory.stopPlayback();
        setPlayingTourId(null);
      }
    } catch {
      /* row stays */
    } finally {
      setDeletingId(null);
    }
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listTours(sceneId, nextCursor);
      setTours((prev) => [...prev, ...(res.tours ?? [])]);
      setNextCursor(res.nextCursor);
    } catch {
      /* keep existing list */
    } finally {
      setLoadingMore(false);
    }
  };

  const handleStopPlayback = () => {
    trajectory.stopPlayback();
    setPlayingTourId(null);
  };

  const viewerReady = isViewerStarted() && readViewMatrix() !== null;
  const canSave =
    titleDraft.trim() !== "" &&
    stops.length >= MIN_TOUR_ITEMS &&
    !saving;

  return (
    <div className="tours-panel">
      <div className="tours-header">
        <span className="tours-title">Tours</span>
        {!builderOpen ? (
          <button
            type="button"
            className="tours-btn tours-btn--new"
            onClick={openBuilder}
          >
            New tour
          </button>
        ) : (
          <button
            type="button"
            className="tours-btn"
            disabled={saving}
            onClick={closeBuilder}
          >
            Cancel
          </button>
        )}
      </div>

      {builderOpen ? (
        <form
          className="tours-builder"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSaveTour();
          }}
        >
          <input
            ref={titleInputRef}
            type="text"
            className="tours-input"
            placeholder="Tour title"
            maxLength={MAX_TOUR_TITLE_LENGTH}
            value={titleDraft}
            disabled={saving}
            onChange={(e) => setTitleDraft(e.target.value)}
          />

          <label className="tours-field-label">
            Segment duration (seconds)
            <input
              type="number"
              className="tours-input tours-input--number"
              min={MIN_SEGMENT_DURATION_MS / 1000}
              max={MAX_SEGMENT_DURATION_MS / 1000}
              step={0.5}
              value={segmentSeconds}
              disabled={saving}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                if (Number.isFinite(parsed)) {
                  setSegmentSeconds(clampSegmentSeconds(parsed));
                }
              }}
            />
          </label>

          <div className="tours-stops-header">
            <span className="tours-stops-label">
              Stops ({stops.length}/{MAX_TOUR_ITEMS})
            </span>
            <div className="tours-stops-actions">
              <button
                type="button"
                className="tours-btn tours-btn--small"
                disabled={!viewerReady || stops.length >= MAX_TOUR_ITEMS}
                onClick={captureCurrentView}
              >
                Capture view
              </button>
            </div>
          </div>

          {shotsLoading ? (
            <div className="tours-loading">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              <span>Loading shots…</span>
            </div>
          ) : availableShots.length > 0 ? (
            <div className="tours-shot-picker">
              <span className="tours-shot-picker-label">Add from shots:</span>
              <div className="tours-shot-picker-list">
                {availableShots.map((shot) => (
                  <button
                    key={shot.shotId}
                    type="button"
                    className="tours-btn tours-btn--small"
                    disabled={stops.length >= MAX_TOUR_ITEMS}
                    onClick={() => addStopFromShot(shot)}
                  >
                    + {shot.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {stops.length === 0 ? (
            <p className="tours-empty">
              Add at least {MIN_TOUR_ITEMS} stops from shots or the current view.
            </p>
          ) : (
            <ol className="tours-stops-list">
              {stops.map((stop, index) => (
                <li key={stop.clientId} className="tours-stop-row">
                  <span className="tours-stop-index">{index + 1}</span>
                  <input
                    type="text"
                    className="tours-input tours-input--stop"
                    value={stop.label}
                    disabled={saving}
                    onChange={(e) => {
                      const value = e.target.value;
                      setStops((prev) =>
                        prev.map((s) =>
                          s.clientId === stop.clientId
                            ? { ...s, label: value }
                            : s,
                        ),
                      );
                    }}
                  />
                  <div className="tours-stop-controls">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Move stop up"
                      disabled={index === 0 || saving}
                      className="tours-icon-btn"
                      onClick={() => moveStop(index, -1)}
                    >
                      <ArrowUp className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Move stop down"
                      disabled={index === stops.length - 1 || saving}
                      className="tours-icon-btn"
                      onClick={() => moveStop(index, 1)}
                    >
                      <ArrowDown className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Remove stop"
                      disabled={saving}
                      className="tours-icon-btn tours-icon-btn--delete"
                      onClick={() => removeStop(stop.clientId)}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <button
            type="submit"
            className="tours-btn tours-btn--save"
            disabled={!canSave}
          >
            {saving ? "Saving…" : "Save tour"}
          </button>
          {saveError ? <p className="tours-error">{saveError}</p> : null}
        </form>
      ) : (
        <>
          {tourLinkNotice ? (
            <p className="tours-notice">{tourLinkNotice}</p>
          ) : null}
          {copyNotice ? <p className="tours-notice">{copyNotice}</p> : null}

          {loading ? (
            <div className="tours-loading">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              <span>Loading…</span>
            </div>
          ) : loadError ? (
            <p className="tours-error">{loadError}</p>
          ) : tours.length === 0 ? (
            <p className="tours-empty">No tours yet</p>
          ) : (
            <ul className="tours-list">
              {tours.map((tour) => {
                const handle = tour.creatorUsername.trim().toLowerCase();
                const isPlaying =
                  playingTourId === tour.tourId &&
                  trajectory.status === "playing";

                return (
                  <li key={tour.tourId} className="tours-row">
                    <div className="tours-row-main">
                      <span className="tours-row-title">{tour.title}</span>
                      <span className="tours-row-meta">
                        {tour.items.length} stops ·{" "}
                        {(tour.segmentDurationMs / 1000).toFixed(1)}s each
                      </span>
                      {handle ? (
                        <Link
                          href={`/u/${encodeURIComponent(handle)}`}
                          className="tours-creator"
                        >
                          @{handle}
                        </Link>
                      ) : (
                        <span className="tours-creator">@unknown</span>
                      )}
                      {isPlaying ? (
                        <div className="tours-playback">
                          <div className="tours-track">
                            <div
                              className="tours-fill"
                              style={{
                                width: `${trajectory.playbackProgress * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="tours-row-actions">
                      {isPlaying ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Stop tour playback"
                          className="tours-icon-btn"
                          onClick={handleStopPlayback}
                        >
                          <Square className="size-3" />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Play tour"
                          disabled={tour.items.length < MIN_TOUR_ITEMS}
                          className="tours-icon-btn tours-icon-btn--play"
                          onClick={() => playTour(tour)}
                        >
                          <Play className="size-3" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Copy link to this tour"
                        className="tours-icon-btn"
                        onClick={() => void handleCopyLink(tour)}
                      >
                        <Copy className="size-3" />
                      </Button>
                      {canDeleteTour(tour) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Delete tour"
                          disabled={deletingId === tour.tourId}
                          className="tours-icon-btn tours-icon-btn--delete"
                          onClick={() => void handleDelete(tour.tourId)}
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
              className="tours-btn tours-btn--load"
              disabled={loadingMore}
              onClick={() => void handleLoadMore()}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
