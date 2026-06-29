"use strict";

const { mapProgressFromItem } = require("./progress-fields");

const DEFAULT_VISIBILITY = "PRIVATE";
const ALLOWED_VISIBILITY = new Set(["PUBLIC", "PRIVATE"]);

function sceneVisibilityFromItem(item) {
  const value = item?.visibility?.S;
  return value === "PUBLIC" ? "PUBLIC" : DEFAULT_VISIBILITY;
}

function sceneResponseFromItem(item, thumbnailUrl) {
  return {
    sceneId: item.scene_id?.S ?? "",
    name: item.name?.S ?? "",
    inputType: item.input_type?.S ?? "",
    status: item.status?.S ?? "",
    createdAt: item.created_at?.S ?? "",
    visibility: sceneVisibilityFromItem(item),
    ...(item.ply_key ? { plyKey: item.ply_key.S } : {}),
    ...(item.thumbnail_key ? { thumbnailKey: item.thumbnail_key.S } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...mapProgressFromItem(item),
  };
}

module.exports = {
  ALLOWED_VISIBILITY,
  DEFAULT_VISIBILITY,
  sceneVisibilityFromItem,
  sceneResponseFromItem,
};
