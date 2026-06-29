type SceneViewerLineage = {
  forkedFromSceneId?: string | null;
  forkedFromUsername?: string | null;
};

type SceneViewerUrlOptions = SceneViewerLineage & {
  tour?: string | null;
  shot?: string | null;
  remixed?: boolean;
};

/** Build `/scenes/view` URL with optional lineage and deep-link params. */
export function sceneViewerUrl(
  sceneId: string,
  options: SceneViewerUrlOptions = {},
): string {
  const params = new URLSearchParams();
  params.set("id", sceneId);

  if (options.tour) {
    params.set("tour", options.tour);
  } else if (options.shot) {
    params.set("shot", options.shot);
  }

  if (options.remixed) {
    params.set("remixed", "1");
  }

  const fromScene = options.forkedFromSceneId?.trim();
  const fromUser = options.forkedFromUsername?.trim();
  if (fromScene) params.set("fromScene", fromScene);
  if (fromUser) params.set("fromUser", fromUser);

  return `/scenes/view?${params.toString()}`;
}
