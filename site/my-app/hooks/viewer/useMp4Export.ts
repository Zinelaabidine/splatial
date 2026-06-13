import { useCallback, useRef, useState } from "react";

export type VideoRecordingStatus = "idle" | "recording";

export interface Mp4ExportHook {
  videoStatus: VideoRecordingStatus;
  /** Begin capturing the WebGL canvas. `fps` defaults to 30. */
  startVideoRecording: (fps?: number) => void;
  /** Stop capture and trigger a browser download (.mp4 or .webm). */
  stopVideoRecording: () => void;
}

/** Preferred codec order: H.264 MP4 → VP9 WebM → baseline WebM. */
const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1",
  "video/webm;codecs=vp9",
  "video/webm",
] as const;

export function useMp4Export(): Mp4ExportHook {
  const [videoStatus, setVideoStatus] = useState<VideoRecordingStatus>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<BlobPart[]>([]);

  const startVideoRecording = useCallback((fps = 30) => {
    const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
    if (!canvas) {
      console.warn("[useMp4Export] #canvas not found — is the viewer mounted?");
      return;
    }

    const mimeType =
      MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ??
      "video/webm";

    // captureStream is part of the HTML spec but may need a cast for TS
    const stream = (
      canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }
    ).captureStream(fps);

    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const ext  = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `splat-export.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setVideoStatus("idle");
    };

    // Collect a chunk every 100 ms so data is not lost if the tab is closed
    recorder.start(100);
    recorderRef.current = recorder;
    setVideoStatus("recording");
  }, []);

  const stopVideoRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  return { videoStatus, startVideoRecording, stopVideoRecording };
}
