"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { applyProgressFields } = require("../lib/progress-fields");

const dynamo = new DynamoDBClient({});
const TABLE  = process.env.SCENES_TABLE_NAME;

/**
 * POST /api/attempts/:attemptId/heartbeat
 *
 * Called by the EC2 worker to report liveness and progress. Auth via
 * per-job worker token sent as Bearer token.
 *
 * Body: {
 *   progressPhase, progressPercent,
 *   progressSubPhase?, progressEtaSeconds?
 * }
 */
exports.handler = async (event) => {
  const attemptId = event.pathParameters?.attemptId;
  if (!attemptId) return response(400, { error: "Missing attemptId" });

  const authHeader = event.headers?.authorization ?? event.headers?.Authorization ?? "";
  const workerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!workerToken) return response(401, { error: "Missing Authorization header" });

  const { Item } = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { scene_id: { S: attemptId } } })
  );
  if (!Item) return response(404, { error: "Scene not found" });
  if (Item.worker_token?.S !== workerToken) return response(403, { error: "Invalid worker token" });

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  const now        = new Date().toISOString();
  const exprParts  = ["updated_at = :now", "last_heartbeat_at = :now"];
  const exprValues = { ":now": { S: now } };

  applyProgressFields(body, exprParts, exprValues);

  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: attemptId } },
      UpdateExpression: "SET " + exprParts.join(", "),
      ExpressionAttributeValues: exprValues,
    })
  );

  // Cascade progress to parent scene (same as attempt-patch) so dashboard polling sees updates.
  const parentSceneId = Item.parent_scene_id?.S;
  const hasProgress = body && (
    body.progressPhase
    || typeof body.progressPercent === "number"
    || body.progressSubPhase
    || typeof body.progressEtaSeconds === "number"
  );
  if (parentSceneId && hasProgress) {
    const parentParts  = ["updated_at = :now", "last_heartbeat_at = :now"];
    const parentValues = { ":now": { S: now } };

    applyProgressFields(body, parentParts, parentValues);

    await dynamo.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { scene_id: { S: parentSceneId } },
        UpdateExpression: "SET " + parentParts.join(", "),
        ExpressionAttributeValues: parentValues,
      })
    );
  }

  return response(200, { attemptId, received: true });
};
