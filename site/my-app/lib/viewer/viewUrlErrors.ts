/** Map view-url API failures to viewer-friendly copy. */
export function mapViewUrlError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Failed to load the 3D scene. Please try again.";
  }

  const msg = err.message;

  if (msg.includes("Scene is not ready")) {
    return "This scene is still processing. Open it again once its status is Ready.";
  }

  if (msg.includes("no PLY file") || msg.includes("no viewable")) {
    return "This scene has no viewable 3D output yet. If processing just finished, refresh in a moment or re-submit the scene from Your Scenes.";
  }

  if (msg.includes("Scene not found") || msg.includes("404")) {
    return "Scene not found.";
  }

  if (msg.includes("Forbidden") || msg.includes("403")) {
    return "You do not have access to this scene.";
  }

  return msg || "Failed to load the 3D scene. Please try again.";
}
