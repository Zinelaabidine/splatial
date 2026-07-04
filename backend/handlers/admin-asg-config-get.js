"use strict";

const {
  EC2Client,
  DescribeLaunchTemplateVersionsCommand,
  DescribeImagesCommand,
  DescribeInstancesCommand,
} = require("@aws-sdk/client-ec2");
const {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
} = require("@aws-sdk/client-auto-scaling");
const { SQSClient, GetQueueAttributesCommand } = require("@aws-sdk/client-sqs");
const response = require("../lib/response");
const { isAdmin } = require("../lib/admin-auth");

const ec2 = new EC2Client({});
const autoscaling = new AutoScalingClient({});
const sqs = new SQSClient({});

const ASG_NAME = process.env.WORKER_ASG_NAME;
const LAUNCH_TEMPLATE_ID = process.env.WORKER_LAUNCH_TEMPLATE_ID;
const MAX_SIZE_CAP = Number(process.env.WORKER_ASG_MAX_SIZE_CAP || 5);
const QUEUE_URL = process.env.SQS_QUEUE_URL;
// Lambda always sets this reserved env var; used to build ssm/console links.
const REGION = process.env.AWS_REGION || "us-east-1";

const HISTORY_LIMIT = 10;

/**
 * GET /admin/asg-config
 *
 * Admin-only. Reads the live worker ASG + launch template state so the admin
 * page can render current AMI / instance type / capacity and a short version
 * history for rollback. Read-only — no mutation happens here.
 *
 * Success (200): {
 *   asg: { name, minSize, maxSize, maxSizeCap, desiredCapacity, inServiceInstances,
 *          manualModeActive, manualModeSince, instances: [{ instanceId, lifecycleState,
 *          healthStatus, availabilityZone, instanceType, privateIp, publicIp, launchTime,
 *          ssmCommand, consoleUrl }] },
 *   launchTemplate: { id, latestVersion, defaultVersion },
 *   current: { amiId, amiName, amiState, architecture, instanceType, versionDescription },
 *   history: [{ version, amiId, instanceType, description, createdAt }],
 *   queue: { visible, inFlight }
 * }
 *
 * Workers have no inbound security group rules or SSH key pair by design —
 * access is exclusively via SSM Session Manager (see iam-worker.tf). The
 * `instances` list carries a ready-to-copy `aws ssm start-session` command
 * per instance instead of any SSH connection info.
 */
exports.handler = async (event) => {
  if (!isAdmin(event)) {
    return response(403, { error: "Forbidden: admin role required" });
  }
  if (!ASG_NAME || !LAUNCH_TEMPLATE_ID) {
    return response(500, {
      error:
        "ASG not configured (WORKER_ASG_NAME / WORKER_LAUNCH_TEMPLATE_ID missing)",
    });
  }

  const [asgOut, versionsOut, queueAttrs] = await Promise.all([
    autoscaling.send(
      new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [ASG_NAME] }),
    ),
    ec2.send(
      new DescribeLaunchTemplateVersionsCommand({
        LaunchTemplateId: LAUNCH_TEMPLATE_ID,
      }),
    ),
    QUEUE_URL
      ? sqs
          .send(
            new GetQueueAttributesCommand({
              QueueUrl: QUEUE_URL,
              AttributeNames: [
                "ApproximateNumberOfMessages",
                "ApproximateNumberOfMessagesNotVisible",
              ],
            }),
          )
          .catch((err) => {
            console.error("admin-asg-config: GetQueueAttributes failed", {
              err: err.message,
            });
            return null;
          })
      : Promise.resolve(null),
  ]);

  const asg = asgOut.AutoScalingGroups?.[0];
  if (!asg) {
    return response(404, { error: `ASG not found: ${ASG_NAME}` });
  }

  const versions = (versionsOut.LaunchTemplateVersions ?? []).sort(
    (a, b) => Number(b.VersionNumber) - Number(a.VersionNumber),
  );
  // Versions are sorted newest-first, so the head of the list is $Latest —
  // the version the ASG actually launches instances from.
  const latest = versions[0];

  const currentAmiId = latest?.LaunchTemplateData?.ImageId ?? null;
  const currentInstanceType = latest?.LaunchTemplateData?.InstanceType ?? null;

  let amiMeta = null;
  if (currentAmiId) {
    try {
      const imgOut = await ec2.send(
        new DescribeImagesCommand({ ImageIds: [currentAmiId] }),
      );
      const img = imgOut.Images?.[0];
      if (img) {
        amiMeta = {
          name: img.Name ?? null,
          state: img.State ?? null,
          architecture: img.Architecture ?? null,
          creationDate: img.CreationDate ?? null,
        };
      }
    } catch {
      /* AMI may have been deregistered since the version was created; non-fatal */
    }
  }

  const history = versions.slice(0, HISTORY_LIMIT).map((v) => ({
    version: Number(v.VersionNumber),
    isDefault: Boolean(v.DefaultVersion),
    amiId: v.LaunchTemplateData?.ImageId ?? null,
    instanceType: v.LaunchTemplateData?.InstanceType ?? null,
    description: v.VersionDescription ?? null,
    createdAt: v.CreateTime ? new Date(v.CreateTime).toISOString() : null,
  }));

  // Enrich the ASG's instance list (id/lifecycle/AZ only) with IPs, EC2
  // state, and a ready-to-copy SSM connect command. Best-effort: an instance
  // can vanish between the two calls (self-terminated) without failing the
  // whole request.
  const asgInstances = asg.Instances ?? [];
  const ec2InstanceById = {};
  if (asgInstances.length > 0) {
    try {
      const instOut = await ec2.send(
        new DescribeInstancesCommand({
          InstanceIds: asgInstances.map((i) => i.InstanceId),
        }),
      );
      for (const reservation of instOut.Reservations ?? []) {
        for (const inst of reservation.Instances ?? []) {
          ec2InstanceById[inst.InstanceId] = inst;
        }
      }
    } catch {
      /* one or more instances may have just terminated; fall back below */
    }
  }

  const instances = asgInstances.map((i) => {
    const inst = ec2InstanceById[i.InstanceId];
    return {
      instanceId: i.InstanceId,
      lifecycleState: i.LifecycleState,
      healthStatus: i.HealthStatus ?? null,
      availabilityZone: i.AvailabilityZone ?? null,
      instanceType: inst?.InstanceType ?? null,
      privateIp: inst?.PrivateIpAddress ?? null,
      publicIp: inst?.PublicIpAddress ?? null,
      launchTime: inst?.LaunchTime ? new Date(inst.LaunchTime).toISOString() : null,
      // No SSH — workers have zero inbound SG rules and no key pair.
      // AmazonSSMManagedInstanceCore is attached, so Session Manager works
      // without opening any ports.
      ssmCommand: `aws ssm start-session --target ${i.InstanceId} --region ${REGION}`,
      consoleUrl: `https://${REGION}.console.aws.amazon.com/ec2/home?region=${REGION}#InstanceDetails:instanceId=${i.InstanceId}`,
    };
  });

  return response(200, {
    asg: {
      name: asg.AutoScalingGroupName,
      minSize: asg.MinSize,
      maxSize: asg.MaxSize,
      maxSizeCap: MAX_SIZE_CAP,
      desiredCapacity: asg.DesiredCapacity,
      inServiceInstances: (asg.Instances ?? []).filter(
        (i) => i.LifecycleState === "InService",
      ).length,
      // True when a manual "boot a worker now" test session (POST
      // /admin/asg/boot) is active — SQS-driven scale-out/scale-in is paused
      // until an admin calls POST /admin/asg/release.
      manualModeActive: (asg.SuspendedProcesses ?? []).some(
        (p) => p.ProcessName === "AlarmNotification",
      ),
      // Stamped by POST /admin/asg/boot, cleared by POST /admin/asg/release —
      // there's no AWS-native "process suspended since" timestamp, so this is
      // tracked via an ASG tag instead. Used by the frontend to show elapsed
      // time and by the scheduled check in admin-notifications.tf.
      manualModeSince:
        (asg.Tags ?? []).find((t) => t.Key === "ManualModeSince")?.Value ?? null,
      instances,
    },
    launchTemplate: {
      id: LAUNCH_TEMPLATE_ID,
      latestVersion: latest ? Number(latest.VersionNumber) : null,
      defaultVersion:
        versions.find((v) => v.DefaultVersion)?.VersionNumber != null
          ? Number(versions.find((v) => v.DefaultVersion).VersionNumber)
          : null,
    },
    current: {
      amiId: currentAmiId,
      amiName: amiMeta?.name ?? null,
      amiState: amiMeta?.state ?? null,
      architecture: amiMeta?.architecture ?? null,
      instanceType: currentInstanceType,
      versionDescription: latest?.VersionDescription ?? null,
    },
    history,
    queue: {
      visible: queueAttrs?.Attributes?.ApproximateNumberOfMessages != null
        ? Number(queueAttrs.Attributes.ApproximateNumberOfMessages)
        : null,
      inFlight:
        queueAttrs?.Attributes?.ApproximateNumberOfMessagesNotVisible != null
          ? Number(queueAttrs.Attributes.ApproximateNumberOfMessagesNotVisible)
          : null,
    },
  });
};
