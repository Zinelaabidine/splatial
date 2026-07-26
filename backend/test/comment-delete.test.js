"use strict";

/**
 * Lightweight assertion-based tests for comment deletion — no test framework
 * is configured in this package (see CLAUDE.md §4's "no test framework
 * configured" note for backend/), so these run directly under plain Node:
 *
 *   node backend/test/comment-delete.test.js
 *
 * DynamoDBClient.prototype.send is monkey-patched with a queue of canned
 * responses so lib/comments.js and handlers/comment-delete.js can be
 * exercised end-to-end without a real AWS connection. This is also the
 * regression test for the bug fixed here: every delete used to return a
 * hard 500 because two ConditionExpressions called `if_not_exists(...)`,
 * which DynamoDB only allows inside UpdateExpression SET clauses, not
 * ConditionExpression — see the assertion on TransactWriteItemsCommand
 * below.
 */

const assert = require("node:assert/strict");

process.env.SCENES_TABLE_NAME = "test-scenes";
process.env.COMMENTS_TABLE_NAME = "test-comments";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");

const sentCommands = [];
let responses = [];

// Patched on the prototype so it affects every DynamoDBClient instance,
// including the separate ones constructed inside comment-delete.js and
// lib/comments.js.
DynamoDBClient.prototype.send = async function send(command) {
  sentCommands.push(command);
  if (responses.length === 0) {
    throw new Error(`no canned response queued for ${command.constructor.name}`);
  }
  const next = responses.shift();
  if (next instanceof Error) throw next;
  return next;
};

const commentDelete = require("../handlers/comment-delete");

const SCENE_ID = "b5e75d62-515c-4fc6-aed7-56f8e6fb72c1";
// Real example ID from the bug report: ISO timestamp + "#" + uuid — the
// exact shape that broke DELETE before this fix.
const COMMENT_ID = "2026-07-26T10:46:10.783Z#24a6d82a-5e69-4990-a6fd-73cf92c5cea9";

function eventFor({ userId, sceneId, commentId }) {
  return {
    requestContext: userId
      ? { authorizer: { jwt: { claims: { sub: userId } } } }
      : {},
    pathParameters: { sceneId, commentId },
  };
}

function sceneItem({ ownerId, visibility }) {
  return {
    Item: {
      scene_id: { S: SCENE_ID },
      user_id: { S: ownerId },
      ...(visibility ? { visibility: { S: visibility } } : {}),
    },
  };
}

function commentItem({ authorId, parentCommentId = null, replyCount = 0 }) {
  return {
    Item: {
      scene_id: { S: SCENE_ID },
      comment_id: { S: COMMENT_ID },
      user_id: { S: authorId },
      ...(parentCommentId ? { parent_comment_id: { S: parentCommentId } } : {}),
      ...(replyCount ? { reply_count: { N: String(replyCount) } } : {}),
    },
  };
}

async function run() {
  // --- Unauthenticated request -> 401, no DynamoDB calls at all ---
  {
    responses = [];
    sentCommands.length = 0;
    const res = await commentDelete.handler(
      eventFor({ userId: null, sceneId: SCENE_ID, commentId: COMMENT_ID }),
    );
    assert.equal(res.statusCode, 401);
    assert.equal(sentCommands.length, 0);
  }

  // --- Scene does not exist -> 404 "Scene not found" ---
  {
    responses = [{ Item: undefined }];
    sentCommands.length = 0;
    const res = await commentDelete.handler(
      eventFor({ userId: "user-1", sceneId: SCENE_ID, commentId: COMMENT_ID }),
    );
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.body).error, "Scene not found");
  }

  // --- Scene exists but is private and caller isn't the owner -> 403 ---
  {
    responses = [sceneItem({ ownerId: "owner-1", visibility: "PRIVATE" })];
    sentCommands.length = 0;
    const res = await commentDelete.handler(
      eventFor({ userId: "user-1", sceneId: SCENE_ID, commentId: COMMENT_ID }),
    );
    assert.equal(res.statusCode, 403);
  }

  // --- Scene is public, comment does not exist -> 404 "Comment not found",
  //     not a 500 ---
  {
    responses = [
      sceneItem({ ownerId: "owner-1", visibility: "PUBLIC" }),
      { Item: undefined }, // getComment finds nothing
    ];
    sentCommands.length = 0;
    const res = await commentDelete.handler(
      eventFor({ userId: "user-1", sceneId: SCENE_ID, commentId: COMMENT_ID }),
    );
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.body).error, "Comment not found");
  }

  // --- Scene is public, comment exists but belongs to someone else, and the
  //     caller is not the scene owner either -> 403, not a 500 ---
  {
    responses = [
      sceneItem({ ownerId: "owner-1", visibility: "PUBLIC" }),
      commentItem({ authorId: "someone-else" }),
    ];
    sentCommands.length = 0;
    const res = await commentDelete.handler(
      eventFor({ userId: "user-1", sceneId: SCENE_ID, commentId: COMMENT_ID }),
    );
    assert.equal(res.statusCode, 403);
    assert.equal(JSON.parse(res.body).error, "Forbidden: cannot delete this comment");
  }

  // --- Happy path: author deletes their own top-level comment on a public
  //     scene, using the exact ":"+"#" comment id from the bug report.
  //     This is the regression test for the 500: it fails loudly if the
  //     ConditionExpression bug (if_not_exists in a condition) comes back. ---
  {
    responses = [
      sceneItem({ ownerId: "owner-1", visibility: "PUBLIC" }), // scene lookup
      commentItem({ authorId: "user-1" }), // getComment (author matches caller)
      {}, // TransactWriteItemsCommand success
      { Item: { comments_count: { N: "3" } } }, // final scene re-read
    ];
    sentCommands.length = 0;
    const res = await commentDelete.handler(
      eventFor({ userId: "user-1", sceneId: SCENE_ID, commentId: COMMENT_ID }),
    );
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), {
      ok: true,
      commentsCount: 3,
      deletedReplyCount: 0,
    });

    // getComment must look the item up by the exact, unmodified comment id —
    // no re-encoding/decoding at this layer.
    const getCommentCall = sentCommands[1];
    assert.equal(getCommentCall.input.Key.comment_id.S, COMMENT_ID);

    // Regression guard: neither ConditionExpression in the transaction may
    // use if_not_exists(), which DynamoDB rejects with a ValidationException
    // (no .statusCode) that used to surface as an unconditional 500.
    const transactCall = sentCommands[2];
    for (const item of transactCall.input.TransactItems) {
      const cond = item.Update?.ConditionExpression ?? item.Delete?.ConditionExpression;
      if (cond) {
        assert.ok(
          !cond.includes("if_not_exists("),
          `ConditionExpression must not use if_not_exists(): ${cond}`,
        );
      }
    }
  }

  console.log("comment-delete.test.js: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
