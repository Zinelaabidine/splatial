/**
 * Upload Init Lambda — stub
 * POST /upload/init
 *
 * Accepts a JSON body: { "filename": "scene.glb", "contentType": "model/gltf-binary" }
 * Returns:            { "uploadId": "...", "key": "...", "sceneId": "..." }
 *
 * Full implementation added in Phase 3.
 */
exports.handler = async (event) => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "upload init stub — Phase 3 not yet implemented" }),
  };
};
