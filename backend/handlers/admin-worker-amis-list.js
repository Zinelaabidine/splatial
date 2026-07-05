"use strict";

const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { isAdmin } = require("../lib/admin-auth");

const dynamo = new DynamoDBClient({});
const TABLE = process.env.SCENES_TABLE_NAME;

function mapAmi(item) {
  return {
    amiId: item.scene_id?.S ?? "",
    label: item.label?.S ?? "",
    description: item.description?.S ?? null,
    architecture: item.architecture?.S ?? null,
    createdBy: item.created_by?.S ?? null,
    createdAt: item.created_at?.S ?? null,
  };
}

/**
 * GET /admin/worker-amis
 *
 * Admin-only. Lists the curated registry of worker AMIs (record_type =
 * "worker_ami") that admins have explicitly registered via POST
 * /admin/worker-amis. This is NOT a live query against AWS — it's a small,
 * hand-curated list so the ASG config page can offer a dropdown of
 * known-good AMIs instead of a free-text field or an EC2 DescribeImages
 * catalog listing.
 *
 * Success (200): { items: WorkerAmi[] }
 */
exports.handler = async (event) => {
  if (!isAdmin(event)) {
    return response(403, { error: "Forbidden: admin role required" });
  }

  const out = await dynamo.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "#rt = :ami",
      ExpressionAttributeNames: { "#rt": "record_type" },
      ExpressionAttributeValues: { ":ami": { S: "worker_ami" } },
    }),
  );

  const items = (out.Items ?? [])
    .map(mapAmi)
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));

  return response(200, { items });
};
