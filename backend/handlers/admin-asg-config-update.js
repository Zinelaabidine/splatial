"use strict";

const {
  EC2Client,
  DescribeImagesCommand,
  DescribeInstanceTypesCommand,
  DescribeLaunchTemplateVersionsCommand,
  CreateLaunchTemplateVersionCommand,
} = require("@aws-sdk/client-ec2");
const {
  AutoScalingClient,
  UpdateAutoScalingGroupCommand,
} = require("@aws-sdk/client-auto-scaling");
const response = require("../lib/response");
const { isAdmin, getClaims } = require("../lib/admin-auth");
const { notifyAdmins } = require("../lib/notify");

const ec2 = new EC2Client({});
const autoscaling = new AutoScalingClient({});

const ASG_NAME = process.env.WORKER_ASG_NAME;
const LAUNCH_TEMPLATE_ID = process.env.WORKER_LAUNCH_TEMPLATE_ID;
const MAX_SIZE_CAP = Number(process.env.WORKER_ASG_MAX_SIZE_CAP || 5);

const AMI_ID_RE = /^ami-[a-f0-9]{8,17}$/;
const INSTANCE_TYPE_RE = /^[a-z0-9]+\.[a-z0-9]+$/;

/**
 * POST /admin/asg-config
 *
 * Admin-only. Updates the GPU worker fleet at runtime — no Terraform apply,
 * no GitHub Actions deploy:
 *   - amiId / instanceType -> ec2:CreateLaunchTemplateVersion (a new launch
 *     template version, never the default). aws_autoscaling_group.worker
 *     references version = "$Latest", so new instances pick this up on the
 *     very next scale-out. The Terraform-tracked default version is
 *     untouched, so `terraform plan` stays clean.
 *   - maxSize -> autoscaling:UpdateAutoScalingGroup. compute.tf's
 *     lifecycle.ignore_changes on max_size keeps Terraform from reverting it.
 *
 * Body (at least one field required):
 *   { amiId?: string, instanceType?: string, maxSize?: number, reason?: string }
 *
 * Success (200): the fields that were actually changed + the new launch
 * template version number (if a template change was made).
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

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { error: "Malformed JSON body" });
  }

  const amiId = typeof body.amiId === "string" ? body.amiId.trim() : undefined;
  const instanceType =
    typeof body.instanceType === "string" ? body.instanceType.trim() : undefined;
  const maxSizeRaw = body.maxSize;
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";

  const wantsTemplateChange = amiId !== undefined || instanceType !== undefined;
  const wantsMaxSizeChange = maxSizeRaw !== undefined && maxSizeRaw !== null;

  if (!wantsTemplateChange && !wantsMaxSizeChange) {
    return response(400, {
      error: "Provide at least one of: amiId, instanceType, maxSize",
    });
  }

  if (amiId !== undefined && (amiId === "" || !AMI_ID_RE.test(amiId))) {
    return response(400, { error: "amiId must look like ami-xxxxxxxxxxxxxxxxx" });
  }
  if (
    instanceType !== undefined &&
    (instanceType === "" || !INSTANCE_TYPE_RE.test(instanceType))
  ) {
    return response(400, { error: "instanceType must look like g5g.xlarge" });
  }

  let maxSize;
  if (wantsMaxSizeChange) {
    maxSize = Number(maxSizeRaw);
    if (!Number.isInteger(maxSize) || maxSize < 0) {
      return response(400, { error: "maxSize must be a non-negative integer" });
    }
    if (maxSize > MAX_SIZE_CAP) {
      return response(400, {
        error: `maxSize cannot exceed the configured cap of ${MAX_SIZE_CAP}`,
      });
    }
  }

  const actorSub = getClaims(event)?.sub ?? "unknown";
  const result = {};

  if (wantsTemplateChange) {
    // Resolve the AMI first — every downstream check depends on it existing.
    if (amiId !== undefined) {
      let imgOut;
      try {
        imgOut = await ec2.send(new DescribeImagesCommand({ ImageIds: [amiId] }));
      } catch (err) {
        console.error("admin-asg-config: DescribeImages failed", {
          amiId,
          err: err.name,
        });
        return response(400, { error: `AMI not found or not accessible: ${amiId}` });
      }
      const img = imgOut.Images?.[0];
      if (!img) {
        return response(400, { error: `AMI not found: ${amiId}` });
      }
      if (img.State !== "available") {
        return response(400, {
          error: `AMI ${amiId} is not available (state: ${img.State})`,
        });
      }

      // Cross-check instance type architecture compatibility when both are
      // being set (or when only the AMI changes, against the type already on
      // the latest launch template version).
      const targetType = instanceType ?? (await getLatestInstanceType());
      if (targetType) {
        const typeOut = await ec2.send(
          new DescribeInstanceTypesCommand({ InstanceTypes: [targetType] }),
        );
        const typeInfo = typeOut.InstanceTypes?.[0];
        if (!typeInfo) {
          return response(400, { error: `Instance type not found: ${targetType}` });
        }
        const supportedArchs =
          typeInfo.ProcessorInfo?.SupportedArchitectures ?? [];
        if (img.Architecture && !supportedArchs.includes(img.Architecture)) {
          return response(400, {
            error: `Architecture mismatch: AMI ${amiId} is ${img.Architecture}, but ${targetType} supports [${supportedArchs.join(", ")}]`,
          });
        }
      }
    } else if (instanceType !== undefined) {
      // Instance type changing alone — still validate it exists and matches
      // the AMI currently on $Latest.
      const typeOut = await ec2.send(
        new DescribeInstanceTypesCommand({ InstanceTypes: [instanceType] }),
      );
      const typeInfo = typeOut.InstanceTypes?.[0];
      if (!typeInfo) {
        return response(400, { error: `Instance type not found: ${instanceType}` });
      }
      const currentAmiId = await getLatestAmiId();
      if (currentAmiId) {
        const imgOut = await ec2.send(
          new DescribeImagesCommand({ ImageIds: [currentAmiId] }),
        );
        const img = imgOut.Images?.[0];
        const supportedArchs =
          typeInfo.ProcessorInfo?.SupportedArchitectures ?? [];
        if (img?.Architecture && !supportedArchs.includes(img.Architecture)) {
          return response(400, {
            error: `Architecture mismatch: current AMI ${currentAmiId} is ${img.Architecture}, but ${instanceType} supports [${supportedArchs.join(", ")}]`,
          });
        }
      }
    }

    const versionOut = await ec2.send(
      new CreateLaunchTemplateVersionCommand({
        LaunchTemplateId: LAUNCH_TEMPLATE_ID,
        SourceVersion: "$Latest",
        VersionDescription: `admin:${actorSub} ${new Date().toISOString()}${reason ? ` — ${reason}` : ""}`.slice(0, 255),
        LaunchTemplateData: {
          ...(amiId !== undefined ? { ImageId: amiId } : {}),
          ...(instanceType !== undefined ? { InstanceType: instanceType } : {}),
        },
      }),
    );

    // Deliberately NOT calling ModifyLaunchTemplate / SetLaunchTemplateDefaultVersion:
    // the ASG already launches from "$Latest", and leaving the default version
    // alone is what keeps Terraform's plan clean (see compute.tf / admin-asg.tf).
    result.launchTemplateVersion = Number(
      versionOut.LaunchTemplateVersion?.VersionNumber,
    );
    if (amiId !== undefined) result.amiId = amiId;
    if (instanceType !== undefined) result.instanceType = instanceType;
  }

  if (wantsMaxSizeChange) {
    await autoscaling.send(
      new UpdateAutoScalingGroupCommand({
        AutoScalingGroupName: ASG_NAME,
        MaxSize: maxSize,
      }),
    );
    result.maxSize = maxSize;
  }

  console.log("admin-asg-config: change applied", {
    actorSub,
    asgName: ASG_NAME,
    changes: result,
  });

  await notifyAdmins({
    title: "Worker ASG config changed",
    message:
      `${actorSub} updated ${ASG_NAME}: ${JSON.stringify(result)}` +
      (reason ? ` — ${reason}` : ""),
  });

  return response(200, result);
};

async function getLatestInstanceType() {
  const out = await ec2.send(
    new DescribeLaunchTemplateVersionsCommand({
      LaunchTemplateId: LAUNCH_TEMPLATE_ID,
      Versions: ["$Latest"],
    }),
  );
  return out.LaunchTemplateVersions?.[0]?.LaunchTemplateData?.InstanceType ?? null;
}

async function getLatestAmiId() {
  const out = await ec2.send(
    new DescribeLaunchTemplateVersionsCommand({
      LaunchTemplateId: LAUNCH_TEMPLATE_ID,
      Versions: ["$Latest"],
    }),
  );
  return out.LaunchTemplateVersions?.[0]?.LaunchTemplateData?.ImageId ?? null;
}
