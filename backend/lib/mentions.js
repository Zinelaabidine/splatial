"use strict";

const { resolveUserIdByUsername } = require("./profile");

const MENTION_REGEX = /(?<![a-zA-Z0-9_])@([a-z0-9_]{3,20})/gi;
const MAX_MENTIONS = 10;

function parseMentionHandles(body) {
  const seen = new Set();
  const handles = [];
  const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
  let match;

  while ((match = regex.exec(body)) !== null) {
    const handle = match[1].toLowerCase();
    if (seen.has(handle)) continue;
    seen.add(handle);
    handles.push(handle);
    if (handles.length >= MAX_MENTIONS) break;
  }

  return handles;
}

async function resolveMentions(dynamo, handles) {
  const usernames = [];
  const userIds = [];

  for (const handle of handles) {
    const userId = await resolveUserIdByUsername(dynamo, handle);
    if (userId) {
      usernames.push(handle);
      userIds.push(userId);
    }
  }

  return { usernames, userIds };
}

module.exports = {
  parseMentionHandles,
  resolveMentions,
};
