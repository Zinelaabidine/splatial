"use strict";

const { DynamoDBClient, ScanCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { isAdmin } = require("../lib/admin-auth");
const { CURRENT_POINTER_KEY, workerAmiFromItem } = require("../lib/worker-ami");

const dynamo = new DynamoDBClient({});
const TABLE = process.env.WORKER_AMIS_TABLE_NAME;

/**
 * GET /admin/worker-amis
 *
 * Admin-only. Lists registered worker AMIs (newest first) plus the registry's
 * "current" pointer (set via POST /admin/worker-amis/{amiId}/activate — see
 * that handler for why this pointer never touches live infra).
 *
 * Success (200): { items: WorkerAmi[], currentAmiId: string | null }
 */
exports.handler = async (event) => {
  if (!isAdmin(event)) {
    return response(403, { error: "Forbidden: admin role required" });
  }

  const [scanResult, currentResult] = await Promise.all([
    dynamo.send(new ScanCommand({ TableName: TABLE })),
    dynamo.send(
      new GetItemCommand({
        TableName: TABLE,
        Key: { ami_id: { S: CURRENT_POINTER_KEY } },
      }),
    ),
  ]);

  const items = (scanResult.Items ?? [])
    .filter((item) => item.ami_id?.S !== CURRENT_POINTER_KEY)
    .map(workerAmiFromItem)
    .sort((a, b) => String(b.registeredAt ?? "").localeCompare(String(a.registeredAt ?? "")));

  const currentAmiId = currentResult.Item?.current_ami_id?.S ?? null;

  return response(200, { items, currentAmiId });
};
