"use strict";

const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { EC2Client, DescribeImagesCommand } = require("@aws-sdk/client-ec2");
const response = require("../lib/response");
const { isAdmin, getClaims } = require("../lib/admin-auth");
const { isValidAmiId, CURRENT_POINTER_KEY, workerAmiFromItem } = require("../lib/worker-ami");
const logger = require("../lib/logger");

const dynamo = new DynamoDBClient({});
const ec2 = new EC2Client({});
const TABLE = process.env.WORKER_AMIS_TABLE_NAME;

/**
 * POST /admin/worker-amis
 *
 * Admin-only. Registers an AMI baked by .github/workflows/bake-worker-ami.yml
 * into the registry so it can be picked for "Manual worker boot" / "Update
 * configuration". DynamoDB write only — never touches the live ASG.
 *
 * Body: { amiId: string, label: string, baseAmiId?: string, reason?: string }
 * Success (201): WorkerAmi
 */
exports.handler = async (event) => {
  const log = logger.forEvent(event, "admin-worker-ami-register");

  if (!isAdmin(event)) {
    return response(403, { error: "Forbidden: admin role required" });
  }

  const claims = getClaims(event);
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Missing authenticated user" });

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  const { amiId, label, baseAmiId, reason } = body ?? {};

  if (amiId === CURRENT_POINTER_KEY || !isValidAmiId(amiId)) {
    return response(400, { error: "amiId must look like ami-xxxxxxxxxxxxxxxxx" });
  }
  if (typeof label !== "string" || label.trim() === "") {
    return response(400, { error: "label is required" });
  }

  const trimmedAmiId = amiId.trim();

  const { Item: existing } = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { ami_id: { S: trimmedAmiId } } }),
  );
  if (existing) {
    return response(409, { error: `${trimmedAmiId} is already registered` });
  }

  // Best-effort validation that the AMI actually exists and is available.
  // Never resource-scoped in IAM (DescribeImages has no resource-level
  // permissions) — see admin-worker-amis.tf.
  let architecture = null;
  try {
    const described = await ec2.send(new DescribeImagesCommand({ ImageIds: [trimmedAmiId] }));
    const image = described.Images?.[0];
    if (!image) {
      return response(400, { error: `${trimmedAmiId} was not found in this account/region` });
    }
    if (image.State !== "available") {
      return response(400, { error: `${trimmedAmiId} is not available yet (state: ${image.State})` });
    }
    architecture = image.Architecture ?? null;
  } catch (err) {
    log.error("worker_ami.describe_failed", { data: { amiId: trimmedAmiId, err: String(err) } });
    return response(400, { error: `Could not verify ${trimmedAmiId} via EC2 DescribeImages` });
  }

  const now = new Date().toISOString();
  const item = {
    ami_id: { S: trimmedAmiId },
    label: { S: label.trim() },
    registered_at: { S: now },
    registered_by: { S: userId },
    ...(architecture ? { architecture: { S: architecture } } : {}),
    ...(typeof baseAmiId === "string" && baseAmiId.trim() !== ""
      ? { base_ami_id: { S: baseAmiId.trim() } }
      : {}),
    ...(typeof reason === "string" && reason.trim() !== "" ? { reason: { S: reason.trim() } } : {}),
  };

  await dynamo.send(new PutItemCommand({ TableName: TABLE, Item: item }));

  log.event("worker_ami.registered", { data: { amiId: trimmedAmiId, label: label.trim() } });

  return response(201, workerAmiFromItem(item));
};
