"use strict";

const {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  SuspendProcessesCommand,
  UpdateAutoScalingGroupCommand,
  CreateOrUpdateTagsCommand,
} = require("@aws-sdk/client-auto-scaling");
const response = require("../lib/response");
const { isAdmin, getClaims } = require("../lib/admin-auth");

const autoscaling = new AutoScalingClient({});

const ASG_NAME = process.env.WORKER_ASG_NAME;

/**
 * POST /admin/asg/boot
 *
 * Admin-only. Forces the worker ASG's desired capacity up right now, instead
 * of waiting for a real SQS job to trigger the step-scaling alarm — used to
 * smoke-test a newly-selected AMI/instance type before pointing real traffic
 * at it.
 *
 * Suspends the ASG's "AlarmNotification" process first: without this, the
 * existing sqs-scale-in CloudWatch alarm (queue empty + capacity > 0) fires
 * within ~60s and resets desired capacity back to 0, killing the test
 * instance before it can be inspected. The worker's own idle self-termination
 * (IDLE_EXIT_SECONDS, default 120s) still applies independently of this
 * suspension, since it calls the ASG API directly rather than going through
 * a scaling policy.
 *
 * IMPORTANT: while suspended, the scale-OUT alarm is also paused, so real
 * incoming jobs will queue but NOT trigger a worker launch until an admin
 * calls POST /admin/asg/release. The frontend must surface this clearly.
 *
 * Body: { count?: number (default 1), reason?: string }
 * Success (200): { desiredCapacity, manualModeActive: true }
 */
exports.handler = async (event) => {
  if (!isAdmin(event)) {
    return response(403, { error: "Forbidden: admin role required" });
  }
  if (!ASG_NAME) {
    return response(500, { error: "ASG not configured (WORKER_ASG_NAME missing)" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { error: "Malformed JSON body" });
  }

  const count = body.count === undefined ? 1 : Number(body.count);
  if (!Number.isInteger(count) || count < 1) {
    return response(400, { error: "count must be a positive integer" });
  }
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";

  const asgOut = await autoscaling.send(
    new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [ASG_NAME] }),
  );
  const asg = asgOut.AutoScalingGroups?.[0];
  if (!asg) {
    return response(404, { error: `ASG not found: ${ASG_NAME}` });
  }
  if (count > asg.MaxSize) {
    return response(400, {
      error: `count (${count}) exceeds the ASG's current max size (${asg.MaxSize}). Raise max size via POST /admin/asg-config first.`,
    });
  }

  await autoscaling.send(
    new SuspendProcessesCommand({
      AutoScalingGroupName: ASG_NAME,
      ScalingProcesses: ["AlarmNotification"],
    }),
  );
  await autoscaling.send(
    new UpdateAutoScalingGroupCommand({
      AutoScalingGroupName: ASG_NAME,
      DesiredCapacity: count,
    }),
  );

  // Stamp when this manual session started — but only if one isn't already
  // running (re-booting with a new count shouldn't reset the clock the
  // scheduled "active too long" check relies on).
  const alreadyTracking = (asg.Tags ?? []).some((t) => t.Key === "ManualModeSince");
  if (!alreadyTracking) {
    await autoscaling.send(
      new CreateOrUpdateTagsCommand({
        Tags: [
          {
            ResourceId: ASG_NAME,
            ResourceType: "auto-scaling-group",
            Key: "ManualModeSince",
            Value: new Date().toISOString(),
            PropagateAtLaunch: false,
          },
        ],
      }),
    );
  }

  const actorSub = getClaims(event)?.sub ?? "unknown";
  console.log("admin-asg-boot: manual boot requested", {
    actorSub,
    asgName: ASG_NAME,
    count,
    reason,
  });

  return response(200, { desiredCapacity: count, manualModeActive: true });
};
