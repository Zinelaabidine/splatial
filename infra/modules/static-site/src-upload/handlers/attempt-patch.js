"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");

const dynamo = new DynamoDBClient({});
const TABLE  = process.env.SCENES_TABLE_NAME;

// Maps worker execution status → scene management status
const STATUS_MAP = {
  RUNNING:     "PROCESSING",
  SUCCEEDED:   "COMPLETED",
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
  if (!Item) return response(404, { error: "Scene not found" });
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
  } = body;

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
  if (status && STATUS_MAP[status]) {
    exprParts.push("#s = :sceneStatus");
    exprNames["#s"] = "status";
    exprValues[":sceneStatus"] = { S: STATUS_MAP[status] };
    if (status === "SUCCEEDED" && outputBucket && outputPrefix) {
      exprParts.push("output_bucket = :obucket, output_prefix = :oprefix");
      exprValues[":obucket"] = { S: outputBucket };
      exprValues[":oprefix"] = { S: outputPrefix };
    }
  }

  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: attemptId } },
      UpdateExpression: "SET " + exprParts.join(", "),
      ...(Object.keys(exprNames).length > 0 ? { ExpressionAttributeNames: exprNames } : {}),
      ExpressionAttributeValues: exprValues,
    })
  );

  return response(200, { attemptId, updated: true });
};
