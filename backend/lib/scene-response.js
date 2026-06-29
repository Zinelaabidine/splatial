"use strict";

const { mapProgressFromItem } = require("./progress-fields");
const { ALLOWED_REACTIONS } = require("./reaction-types");

const DEFAULT_VISIBILITY = "PRIVATE";
const ALLOWED_VISIBILITY = new Set(["PUBLIC", "PRIVATE"]);

function sceneVisibilityFromItem(item) {
  const value = item?.visibility?.S;
  return value === "PUBLIC" ? "PUBLIC" : DEFAULT_VISIBILITY;
}

function reactionCountsFromItem(item) {
  const counts = {};
  for (const type of ALLOWED_REACTIONS) {
    counts[type] = Number(item?.[`rc_${type}`]?.N ?? 0);
  }
  return counts;
}

function sceneResponseFromItem(item, thumbnailUrl) {
  return {
    sceneId: item.scene_id?.S ?? "",
    name: item.name?.S ?? "",
    inputType: item.input_type?.S ?? "",
    status: item.status?.S ?? "",
    createdAt: item.created_at?.S ?? "",
    visibility: sceneVisibilityFromItem(item),
    category: item.category?.S ?? null,
    tags: item.tags?.SS ?? [],
    reactionsTotal: Number(item.reactions_total?.N ?? 0),
    reactionCounts: reactionCountsFromItem(item),
    commentsCount: Number(item.comments_count?.N ?? 0),
    ...(item.ply_key ? { plyKey: item.ply_key.S } : {}),
    ...(item.thumbnail_key ? { thumbnailKey: item.thumbnail_key.S } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...mapProgressFromItem(item),
  };
}

function feedItemFromScene(item, thumbnailUrl, ownerAvatarUrl) {
  return {
    ...sceneResponseFromItem(item, thumbnailUrl),
    ownerUsername: item.owner_username?.S ?? "",
    ownerDisplayName: item.owner_display_name?.S ?? "",
    ownerAvatarUrl: ownerAvatarUrl ?? null,
  };
}

module.exports = {
  ALLOWED_VISIBILITY,
  DEFAULT_VISIBILITY,
  sceneVisibilityFromItem,
  sceneResponseFromItem,
  feedItemFromScene,
};
