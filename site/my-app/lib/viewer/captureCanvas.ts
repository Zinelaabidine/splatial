const VIEWER_CANVAS_ID = "canvas";

/**
 * Captures the WebGL viewer canvas as a JPEG blob.
 * Requires `preserveDrawingBuffer: true` on the WebGL context.
 */
export function captureViewerCanvas(quality = 0.92): Promise<Blob | null> {
  const canvas = document.getElementById(VIEWER_CANVAS_ID) as HTMLCanvasElement | null;
  if (!canvas) return Promise.resolve(null);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      "image/jpeg",
      quality,
    );
  });
}

export function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
