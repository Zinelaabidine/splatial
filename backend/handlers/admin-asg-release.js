"use strict";

const {
  AutoScalingClient,
  ResumeProcessesCommand,
  UpdateAutoScalingGroupCommand,
  DeleteTagsCommand,
} = require("@aws-sdk/client-auto-scaling");
const response = require("../lib/response");
const { isAdmin, getClaims } = require("../lib/admin-auth");

const autoscaling = new AutoScalingClient({});

const ASG_NAME = process.env.WORKER_ASG_NAME;

/**
 * POST /admin/asg/release
 *
 * Admin-only. Ends a manual "boot a worker now" test session: sets desired
 * capacity back to 0 and resumes the AlarmNotification process so normal
 * SQS-driven scale-out/scale-in takes over again. Safe to call even if no
 * manual boot is active (idempotent — resuming an already-active process, or
 * setting desired capacity that's already 0, is a no-op).
 *
 * Success (200): { desiredCapacity: 0, manualModeActive: false }
 */
exports.handler = async (event) => {
  if (!isAdmin(event)) {
    return response(403, { error: "Forbidden: admin role required" });
  }
  if (!ASG_NAME) {
    return response(500, { error: "ASG not configured (WORKER_ASG_NAME missing)" });
  }

  await autoscaling.send(
    new UpdateAutoScalingGroupCommand({
      AutoScalingGroupName: ASG_NAME,
      DesiredCapacity: 0,
    }),
  );
  await autoscaling.send(
    new ResumeProcessesCommand({
      AutoScalingGroupName: ASG_NAME,
      ScalingProcesses: ["AlarmNotification"],
    }),
  );
  await autoscaling.send(
    new DeleteTagsCommand({
      Tags: [
        { ResourceId: ASG_NAME, ResourceType: "auto-scaling-group", Key: "ManualModeSince" },
        { ResourceId: ASG_NAME, ResourceType: "auto-scaling-group", Key: "ManualModeAlerted" },
      ],
    }),
  );

  const actorSub = getClaims(event)?.sub ?? "unknown";
  console.log("admin-asg-release: manual mode released", {
    actorSub,
    asgName: ASG_NAME,
  });

  return response(200, { desiredCapacity: 0, manualModeActive: false });
};
