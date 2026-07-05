"use strict";

const { DynamoDBClient, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { isAdmin, getClaims } = require("../lib/admin-auth");

const dynamo = new DynamoDBClient({});
const TABLE = process.env.SCENES_TABLE_NAME;

/**
 * DELETE /admin/worker-amis/{amiId}
 *
 * Admin-only. Removes an AMI from the registry (record_type = "worker_ami").
 * This only removes the registry entry — it never touches the actual AMI,
 * any launch template version already using it, or any running instance.
 *
 * Success (200): { amiId, deleted: true }
 */
exports.handler = async (event) => {
  if (!isAdmin(event)) {
    return response(403, { error: "Forbidden: admin role required" });
  }

  const amiId = event.pathParameters?.amiId;
  if (!amiId || typeof amiId !== "string" || amiId.trim() === "") {
    return response(400, { error: "Missing path parameter: amiId" });
  }

  await dynamo.send(
    new DeleteItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: amiId } },
      ConditionExpression: "record_type = :ami",
      ExpressionAttributeValues: { ":ami": { S: "worker_ami" } },
    }),
  ).catch((err) => {
    if (err.name === "ConditionalCheckFailedException") {
      // Either it never existed, or scene_id collided with an unrelated
      // record — either way, nothing worker_ami-shaped was deleted.
      return null;
    }
    throw err;
  });

  const actorSub = getClaims(event)?.sub ?? "unknown";
  console.log("admin-worker-ami-delete: AMI removed from registry", { actorSub, amiId });

  return response(200, { amiId, deleted: true });
};
