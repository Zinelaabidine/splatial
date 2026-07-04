const SPLAT_EXTENSIONS = /\.(splat|ply|spz|ksplat)$/i;

/** Basename for SuperSplat `?filename=` when `?load=` is a presigned URL. */
export function splatFilenameFromUrl(url: string): string {
  try {
    const name = new URL(url).pathname.split("/").pop();
    if (name && SPLAT_EXTENSIONS.test(name)) return name;
  } catch {
    /* invalid URL — fall through */
  }
  return "scene.splat";
}
