"use strict";

const { EC2Client, DescribeImagesCommand } = require("@aws-sdk/client-ec2");
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { isAdmin, getClaims } = require("../lib/admin-auth");

const ec2 = new EC2Client({});
const dynamo = new DynamoDBClient({});
const TABLE = process.env.SCENES_TABLE_NAME;

const AMI_ID_RE = /^ami-[a-f0-9]{8,17}$/;

/**
 * POST /admin/worker-amis
 *
 * Admin-only. Registers an AMI into the worker-AMI registry (record_type =
 * "worker_ami" in the scenes table) so it shows up in the ASG config page's
 * dropdown. This is the ONLY place in this flow that calls out to AWS — a
 * single DescribeImages lookup on the one AMI being registered, to catch
 * typos immediately. Listing/selecting registered AMIs elsewhere never
 * touches AWS.
 *
 * Body: { amiId: string, label: string, description?: string }
 * Success (201): { amiId, label, description, architecture, createdBy, createdAt }
 */
exports.handler = async (event) => {
  if (!isAdmin(event)) {
    return response(403, { error: "Forbidden: admin role required" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { error: "Malformed JSON body" });
  }

  const amiId = typeof body.amiId === "string" ? body.amiId.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 500) : "";

  if (!amiId || !AMI_ID_RE.test(amiId)) {
    return response(400, { error: "amiId must look like ami-xxxxxxxxxxxxxxxxx" });
  }
  if (!label) {
    return response(400, { error: "Missing required field: label" });
  }
  if (label.length > 120) {
    return response(400, { error: "label must be 120 characters or fewer" });
  }

  // Reject re-registering an AMI that's already in the list — delete it first
  // if the intent is to replace its label/description.
  const existing = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { scene_id: { S: amiId } } }),
  );
  if (existing.Item) {
    return response(409, { error: `AMI ${amiId} is already registered` });
  }

  // Single-image existence/state check — never a catalog listing.
  let img;
  try {
    const imgOut = await ec2.send(new DescribeImagesCommand({ ImageIds: [amiId] }));
    img = imgOut.Images?.[0];
  } catch (err) {
    console.error("admin-worker-ami-create: DescribeImages failed", {
      amiId,
      err: err.name,
    });
    return response(400, { error: `AMI not found or not accessible: ${amiId}` });
  }
  if (!img) {
    return response(400, { error: `AMI not found: ${amiId}` });
  }
  if (img.State !== "available") {
    return response(400, { error: `AMI ${amiId} is not available (state: ${img.State})` });
  }

  const actorSub = getClaims(event)?.sub ?? "unknown";
  const now = new Date().toISOString();
  const architecture = img.Architecture ?? null;

  await dynamo.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: {
        scene_id: { S: amiId },
        record_type: { S: "worker_ami" },
        label: { S: label },
        ...(description ? { description: { S: description } } : {}),
        ...(architecture ? { architecture: { S: architecture } } : {}),
        created_by: { S: actorSub },
        created_at: { S: now },
      },
      ConditionExpression: "attribute_not_exists(scene_id)",
    }),
  );

  console.log("admin-worker-ami-create: AMI registered", { actorSub, amiId, label });

  return response(201, {
    amiId,
    label,
    description: description || null,
    architecture,
    createdBy: actorSub,
    createdAt: now,
  });
};
