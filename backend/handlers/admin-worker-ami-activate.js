"use strict";

const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { isAdmin, getClaims } = require("../lib/admin-auth");
const { CURRENT_POINTER_KEY } = require("../lib/worker-ami");
const logger = require("../lib/logger");

const dynamo = new DynamoDBClient({});
const TABLE = process.env.WORKER_AMIS_TABLE_NAME;

const DEPLOY_NOTE =
  "Registry pointer only — the ASG still runs whatever locals.worker_ami_id in " +
  "infra/modules/static-site/compute.tf resolves to. To actually deploy this " +
  "AMI, a human must update that value and run the normal terraform plan/apply.";

/**
 * POST /admin/worker-amis/{amiId}/activate ("Update configuration")
 *
 * Admin-only. Sets the registry's app-level "current AMI" pointer — a plain
 * DynamoDB write used to pre-select a default in the admin UI and show which
 * AMI is considered current. Deliberately makes NO EC2/Auto Scaling API
 * calls: the live ASG Launch Template stays 100% Terraform-owned, per
 * CLAUDE.md's rule that the deployed worker AMI is only ever changed by a
 * human through plan/apply. See admin-worker-amis.tf for the full rationale.
 *
 * Success (200): { currentAmiId, note }
 */
exports.handler = async (event) => {
  const log = logger.forEvent(event, "admin-worker-ami-activate");

  if (!isAdmin(event)) {
    return response(403, { error: "Forbidden: admin role required" });
  }

  const claims = getClaims(event);
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Missing authenticated user" });

  const amiId = event.pathParameters?.amiId;
  if (!amiId || amiId === CURRENT_POINTER_KEY) {
    return response(400, { error: "Missing or invalid amiId" });
  }

  const { Item } = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { ami_id: { S: amiId } } }),
  );
  if (!Item) {
    return response(404, { error: `${amiId} is not registered` });
  }

  const now = new Date().toISOString();
  await dynamo.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: {
        ami_id: { S: CURRENT_POINTER_KEY },
        current_ami_id: { S: amiId },
        updated_at: { S: now },
        updated_by: { S: userId },
      },
    }),
  );

  log.event("worker_ami.activated", { data: { amiId } });

  return response(200, { currentAmiId: amiId, note: DEPLOY_NOTE });
};
