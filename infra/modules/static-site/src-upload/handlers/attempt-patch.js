"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");

const dynamo = new DynamoDBClient({});
const TABLE  = process.env.SCENES_TABLE_NAME;

// Maps worker execution status → scene management status
const STATUS_MAP = {
  RUNNING:     "PROCESSING",
  SUCCEEDED:   "READY",
  FAILED:      "FAILED",
  INTERRUPTED: "QUEUED",  // message will be re-delivered; worker sets RUNNING again
};

/**
 * PATCH /api/attempts/:attemptId
 *
 * Called by the EC2 worker (not user-facing). Auth via per-job worker token
 * stored in DynamoDB, sent as Bearer token.
 *
 * Body fields (all optional except when driving a status transition):
 *   status, progressPhase, progressPercent, ec2InstanceId, spotRequestId,
 *   reason, errorMessage, outputBucket, outputPrefix
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
  if (!Item) return response(404, { error: "Attempt not found" });
  if (Item.worker_token?.S !== workerToken) return response(403, { error: "Invalid worker token" });

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  const {
    status, progressPhase, progressPercent,
    ec2InstanceId, spotRequestId,
    reason, errorMessage,
    outputBucket, outputPrefix,
    viewKey, plyKey,
  } = body;

  const resolvedViewKey =
    (typeof viewKey === "string" && viewKey.trim() !== "")
      ? viewKey.trim()
      : (typeof plyKey === "string" && plyKey.trim() !== "")
        ? plyKey.trim()
        : null;

  const now = new Date().toISOString();
  const exprParts  = ["updated_at = :now"];
  const exprNames  = {};
  const exprValues = { ":now": { S: now } };

  if (progressPhase) {
    exprParts.push("progress_phase = :phase");
    exprValues[":phase"] = { S: progressPhase };
  }
  if (typeof progressPercent === "number") {
    exprParts.push("progress_percent = :pct");
    exprValues[":pct"] = { N: String(progressPercent) };
  }
  if (ec2InstanceId) {
    exprParts.push("ec2_instance_id = :ec2");
    exprValues[":ec2"] = { S: ec2InstanceId };
  }
  if (spotRequestId) {
    exprParts.push("spot_request_id = :spot");
    exprValues[":spot"] = { S: spotRequestId };
  }
  if (errorMessage) {
    exprParts.push("error_message = :errmsg");
    exprValues[":errmsg"] = { S: errorMessage };
  }
  if (reason) {
    exprParts.push("failure_reason = :reason");
    exprValues[":reason"] = { S: reason };
  }

  const mappedStatus = status && STATUS_MAP[status];
  if (mappedStatus) {
    exprParts.push("#s = :attemptStatus");
    exprNames["#s"] = "status";
    exprValues[":attemptStatus"] = { S: mappedStatus };
    if (status === "SUCCEEDED" && outputBucket && outputPrefix) {
      exprParts.push("output_bucket = :obucket, output_prefix = :oprefix");
      exprValues[":obucket"] = { S: outputBucket };
      exprValues[":oprefix"] = { S: outputPrefix };
    }
    if (status === "SUCCEEDED" && resolvedViewKey) {
      exprParts.push("ply_key = :viewkey");
      exprValues[":viewkey"] = { S: resolvedViewKey };
    }
  }

  // Update the attempt record
  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: attemptId } },
      UpdateExpression: "SET " + exprParts.join(", "),
      ...(Object.keys(exprNames).length > 0 ? { ExpressionAttributeNames: exprNames } : {}),
      ExpressionAttributeValues: exprValues,
    })
  );

  // Cascade status and progress to the parent scene when present.
  // Attempt records created by the new submit-job handler carry parent_scene_id.
  const parentSceneId = Item.parent_scene_id?.S;
  if (parentSceneId) {
    const parentParts  = ["updated_at = :now"];
    const parentNames  = {};
    const parentValues = { ":now": { S: now } };

    if (progressPhase) {
      parentParts.push("progress_phase = :phase");
      parentValues[":phase"] = { S: progressPhase };
    }
    if (typeof progressPercent === "number") {
      parentParts.push("progress_percent = :pct");
      parentValues[":pct"] = { N: String(progressPercent) };
    }
    if (mappedStatus) {
      parentParts.push("#s = :sceneStatus");
      parentNames["#s"] = "status";
      parentValues[":sceneStatus"] = { S: mappedStatus };
      if (status === "SUCCEEDED" && outputBucket && outputPrefix) {
        parentParts.push("output_bucket = :obucket, output_prefix = :oprefix");
        parentValues[":obucket"] = { S: outputBucket };
        parentValues[":oprefix"] = { S: outputPrefix };
      }
      if (status === "SUCCEEDED" && resolvedViewKey) {
        parentParts.push("ply_key = :viewkey");
        parentValues[":viewkey"] = { S: resolvedViewKey };
      }
    }

    await dynamo.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { scene_id: { S: parentSceneId } },
        UpdateExpression: "SET " + parentParts.join(", "),
        ...(Object.keys(parentNames).length > 0 ? { ExpressionAttributeNames: parentNames } : {}),
        ExpressionAttributeValues: parentValues,
      })
    );
  }

  return response(200, { attemptId, updated: true });
};
