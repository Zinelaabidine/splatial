"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { EC2Client, RunInstancesCommand } = require("@aws-sdk/client-ec2");
const response = require("../lib/response");
const { isAdmin } = require("../lib/admin-auth");
const { CURRENT_POINTER_KEY, workerAmiFromItem } = require("../lib/worker-ami");
const logger = require("../lib/logger");

const dynamo = new DynamoDBClient({});
const ec2 = new EC2Client({});
const TABLE = process.env.WORKER_AMIS_TABLE_NAME;
const NAME_PREFIX = `${process.env.WORKER_QUEUE_NAME ?? ""}`.replace(/-splat-processing-queue.*$/, "");

/**
 * Builds the same env-file + systemd-enable user_data the Terraform-managed
 * launch template injects (see compute.tf aws_launch_template.worker), so a
 * manually booted instance behaves identically to a real ASG worker.
 *
 * This drifted once and cost a debugging session: the env file omitted
 * SQS_QUEUE_URL, DLQURL, AWS_REGION and RUN_ENV, so a manually booted worker
 * printed an empty QURL and exited with "No Queue URL found" before polling.
 *
 * The queue URL matters more than it looks. worker.py's resolve_queue_urls()
 * prefers the injected URL and only falls back to sqs:GetQueueUrl by name —
 * a call that needs working credentials. IAM instance-profile credentials take
 * a few seconds to appear in IMDS after RunInstances, so a worker that starts
 * promptly can find metadata (instance id, region) while credentials are still
 * 404ing. Injecting the URL is exactly what makes the worker independent of
 * that race, which is why the launch template has always done it.
 *
 * Any key added to compute.tf's ENVFILE heredoc must be added here too. The
 * parity test in backend/test/worker-boot-userdata.test.js reads that heredoc
 * and fails if the two sets diverge.
 */
function buildUserData() {
  const lines = [
    "#!/bin/bash",
    "set -e",
    "cat > /etc/splatial-worker.env <<'ENVFILE'",
    `QUEUE_NAME=${process.env.WORKER_QUEUE_NAME ?? ""}`,
    `DLQ_NAME=${process.env.WORKER_DLQ_NAME ?? ""}`,
    // Injected so the worker never depends on GetQueueUrl (and therefore on
    // credentials being ready) just to find its own queue.
    `SQS_QUEUE_URL=${process.env.SQS_QUEUE_URL ?? ""}`,
    `DLQURL=${process.env.WORKER_DLQ_URL ?? ""}`,
    `AWS_REGION=${process.env.AWS_REGION ?? "us-east-1"}`,
    // Makes aws_config.get_session() take the instance-role branch even if
    // is_ec2() detection is inconclusive, instead of looking for a local
    // AWS_PROFILE that does not exist on the instance.
    "RUN_ENV=ec2",
    `SPLATIAL_ENV=${process.env.SPLATIAL_ENV ?? "dev"}`,
    `WORKER_LOG_GROUP=${process.env.WORKER_LOG_GROUP ?? ""}`,
    "LOG_TO_CLOUDWATCH=true",
    "ENVFILE",
    "mkdir -p /etc/systemd/system/gaussian-worker.service.d",
    "cat > /etc/systemd/system/gaussian-worker.service.d/env.conf <<'DROPIN'",
    "[Service]",
    "EnvironmentFile=/etc/splatial-worker.env",
    "DROPIN",
    "systemctl daemon-reload",
    "systemctl enable gaussian-worker.service",
    // restart, not start: the AMI may already have the unit enabled, in which
    // case it ran at boot before this env file existed and has since exited.
    // `start` on a dead unit would re-run it, but `restart` is unambiguous
    // whether it is stopped, running or failed.
    "systemctl restart gaussian-worker.service",
  ];
  return Buffer.from(lines.join("\n"), "utf8").toString("base64");
}

/**
 * POST /admin/worker-amis/{amiId}/boot
 *
 * Admin-only. Launches ONE standalone EC2 instance directly from the chosen
 * AMI (ec2:RunInstances) for smoke-testing a real job — the same subnet,
 * security group, and instance profile as the Terraform-managed launch
 * template, but entirely outside the ASG. Desired capacity and the ASG's
 * Launch Template are never touched.
 *
 * Success (200): { amiId, instanceId }
 */
exports.handler = async (event) => {
  const log = logger.forEvent(event, "admin-worker-ami-boot");

  if (!isAdmin(event)) {
    return response(403, { error: "Forbidden: admin role required" });
  }

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
  const ami = workerAmiFromItem(Item);

  // Refuse to launch a worker that cannot find its queue. Without this the
  // instance boots, prints an empty QURL, exits, and bills for the GPU until
  // someone notices — the failure this endpoint exists to surface quickly.
  if (!process.env.SQS_QUEUE_URL) {
    log.error("worker_boot.misconfigured", {
      data: { missing: "SQS_QUEUE_URL" },
    });
    return response(500, {
      error:
        "Worker queue URL is not configured on this function; " +
        "a booted instance would exit without polling.",
    });
  }

  let instanceId;
  try {
    const result = await ec2.send(
      new RunInstancesCommand({
        ImageId: amiId,
        InstanceType: process.env.WORKER_INSTANCE_TYPE,
        MinCount: 1,
        MaxCount: 1,
        SubnetId: process.env.WORKER_SUBNET_ID,
        SecurityGroupIds: [process.env.WORKER_SECURITY_GROUP_ID],
        IamInstanceProfile: { Name: process.env.WORKER_INSTANCE_PROFILE_NAME },
        InstanceInitiatedShutdownBehavior: "terminate",
        InstanceMarketOptions: {
          MarketType: "spot",
          SpotOptions: { SpotInstanceType: "one-time" },
        },
        MetadataOptions: {
          HttpEndpoint: "enabled",
          HttpTokens: "required",
          HttpPutResponseHopLimit: 1,
        },
        BlockDeviceMappings: [
          {
            DeviceName: "/dev/sda1",
            Ebs: { VolumeSize: 40, VolumeType: "gp3", DeleteOnTermination: true },
          },
        ],
        UserData: buildUserData(),
        TagSpecifications: [
          {
            ResourceType: "instance",
            Tags: [
              { Key: "Name", Value: `${NAME_PREFIX || "splatial"}-splat-worker-manual` },
              { Key: "Environment", Value: process.env.SPLATIAL_ENV ?? "dev" },
              { Key: "Project", Value: "splatial" },
              { Key: "ManagedBy", Value: "admin-console" },
              { Key: "Purpose", Value: "manual-boot" },
              { Key: "AllowSelfTerminate", Value: "true" },
              { Key: "WorkerAmiLabel", Value: ami.label ?? "" },
            ],
          },
          {
            ResourceType: "volume",
            Tags: [
              { Key: "Purpose", Value: "manual-boot" },
              { Key: "ManagedBy", Value: "admin-console" },
            ],
          },
        ],
      }),
    );
    instanceId = result.Instances?.[0]?.InstanceId;
  } catch (err) {
    log.error("worker_ami.boot_failed", { data: { amiId, err: String(err) } });
    return response(502, { error: "Failed to launch instance", detail: String(err?.message ?? err) });
  }

  if (!instanceId) {
    return response(502, { error: "RunInstances did not return an instance id" });
  }

  const now = new Date().toISOString();
  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { ami_id: { S: amiId } },
      UpdateExpression: "SET last_boot_instance_id = :iid, last_boot_at = :now",
      ExpressionAttributeValues: { ":iid": { S: instanceId }, ":now": { S: now } },
    }),
  );

  log.event("worker_ami.booted", { data: { amiId, instanceId } });

  return response(200, { amiId, instanceId });
};

// Exported for backend/test/worker-boot-userdata.test.js, which asserts this
// stays in parity with compute.tf's launch-template ENVFILE.
exports.buildUserData = buildUserData;
