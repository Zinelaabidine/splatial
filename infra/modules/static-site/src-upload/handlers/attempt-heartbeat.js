"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");

const dynamo = new DynamoDBClient({});
const TABLE  = process.env.SCENES_TABLE_NAME;

/**
 * POST /api/attempts/:attemptId/heartbeat
 *
 * Called by the EC2 worker to report liveness and progress. Auth via
 * per-job worker token sent as Bearer token.
 *
 * Body: { "progressPhase": "...", "progressPercent": 0-100 }
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

  const { progressPhase, progressPercent } = body;

  const now        = new Date().toISOString();
  const exprParts  = ["updated_at = :now", "last_heartbeat_at = :now"];
  const exprValues = { ":now": { S: now } };

  if (progressPhase) {
    exprParts.push("progress_phase = :phase");
    exprValues[":phase"] = { S: progressPhase };
  }
  if (typeof progressPercent === "number") {
    exprParts.push("progress_percent = :pct");
    exprValues[":pct"] = { N: String(progressPercent) };
  }

  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: attemptId } },
      UpdateExpression: "SET " + exprParts.join(", "),
      ExpressionAttributeValues: exprValues,
    })
  );

  return response(200, { attemptId, received: true });
};
