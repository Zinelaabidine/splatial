import { formatSceneDate, hueFromId } from "@/lib/scenes/sceneMappers";
import type { Scene } from "@/types/api";
import type { Splat, SplatAuthor, SplatSubject } from "@/types/splatworks";

const SUBJECTS: SplatSubject[] = [
  "vase",
  "fountain",
  "interior",
  "trail",
  "desk",
  "statue",
];

/** Pick a stable preview subject from a scene id. */
export function subjectFromSceneId(sceneId: string): SplatSubject {
  let h = 0;
  for (let i = 0; i < sceneId.length; i++) {
    h = (h * 31 + sceneId.charCodeAt(i)) >>> 0;
  }
  return SUBJECTS[h % SUBJECTS.length];
}

/** Map a READY API scene to a gallery splat card. */
export function apiSceneToSplat(scene: Scene, author: SplatAuthor): Splat {
  const hue = hueFromId(scene.sceneId);
  const subject = subjectFromSceneId(scene.sceneId);

  return {
    id: scene.sceneId,
    sceneId: scene.sceneId,
    title: scene.name,
    subject,
    createdAt: formatSceneDate(scene.createdAt),
    createdAtIso: scene.createdAt,
    author,
    preview: {
      baseGradient: `radial-gradient(circle at 50% 44%, hsl(${hue} 35% 18%), #0a0d11 72%)`,
      tintLayers: [`hsla(${hue}, 70%, 65%, 0.55)`],
      dotSize: 5 + (hue % 3),
    },
  };
}
