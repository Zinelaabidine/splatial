"use strict";

const {
  EC2Client,
  DescribeLaunchTemplateVersionsCommand,
  DescribeImagesCommand,
} = require("@aws-sdk/client-ec2");
const {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
} = require("@aws-sdk/client-auto-scaling");
const response = require("../lib/response");
const { isAdmin } = require("../lib/admin-auth");

const ec2 = new EC2Client({});
const autoscaling = new AutoScalingClient({});

const ASG_NAME = process.env.WORKER_ASG_NAME;
const LAUNCH_TEMPLATE_ID = process.env.WORKER_LAUNCH_TEMPLATE_ID;
const MAX_SIZE_CAP = Number(process.env.WORKER_ASG_MAX_SIZE_CAP || 5);

const HISTORY_LIMIT = 10;

/**
 * GET /admin/asg-config
 *
 * Admin-only. Reads the live worker ASG + launch template state so the admin
 * page can render current AMI / instance type / capacity and a short version
 * history for rollback. Read-only — no mutation happens here.
 *
 * Success (200): {
 *   asg: { name, minSize, maxSize, maxSizeCap, desiredCapacity, inServiceInstances },
 *   launchTemplate: { id, latestVersion, defaultVersion },
 *   current: { amiId, amiName, amiState, architecture, instanceType, versionDescription },
 *   history: [{ version, amiId, instanceType, description, createdAt }]
 * }
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

  const [asgOut, versionsOut] = await Promise.all([
    autoscaling.send(
      new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [ASG_NAME] }),
    ),
    ec2.send(
      new DescribeLaunchTemplateVersionsCommand({
        LaunchTemplateId: LAUNCH_TEMPLATE_ID,
      }),
    ),
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
  });
};
