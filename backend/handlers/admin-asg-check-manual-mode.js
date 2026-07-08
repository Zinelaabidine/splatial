"use strict";

const {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  CreateOrUpdateTagsCommand,
  DeleteTagsCommand,
} = require("@aws-sdk/client-auto-scaling");
const { notifyAdmins } = require("../lib/notify");
const { getPoolConfig, POOLS } = require("../lib/worker-pool");

const autoscaling = new AutoScalingClient({});

const ALERT_MINUTES = Number(process.env.MANUAL_MODE_ALERT_MINUTES || 30);

/**
 * INTERNAL /asg/check-manual-mode
 *
 * NOT an API Gateway route — invoked only by the EventBridge rule in
 * admin-notifications.tf (rate(15 minutes)), with a synthetic
 * `{ routeKey: "INTERNAL /asg/check-manual-mode" }` event. No admin-JWT gate
 * needed: nothing outside EventBridge can reach this routeKey.
 *
 * There's no AWS-native "process suspended since" timestamp for an ASG, so
 * POST /admin/asg/boot stamps a ManualModeSince tag and POST /admin/asg/release
 * clears it. This check reads that tag; if AlarmNotification is still
 * suspended and the session has run longer than MANUAL_MODE_ALERT_MINUTES,
 * it fires one Slack/email alert (via a ManualModeAlerted tag so it doesn't
 * repeat every 15 minutes) warning that real jobs may be queuing without
 * scale-out.
 */
// Invoked on a fixed 15-minute schedule with no input (see the
// aws_cloudwatch_event_rule in admin-notifications.tf) — there's no per-call
// parameter to say "check this one pool", so every invocation checks both.
exports.handler = async () => {
  await Promise.all([...POOLS].map(checkPool));
};

async function checkPool(pool) {
  const { asgName: ASG_NAME } = getPoolConfig(pool);
  if (!ASG_NAME) {
    console.error("admin-asg-check-manual-mode: ASG not configured", { pool });
    return;
  }

  const asgOut = await autoscaling.send(
    new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [ASG_NAME] }),
  );
  const asg = asgOut.AutoScalingGroups?.[0];
  if (!asg) {
    console.error("admin-asg-check-manual-mode: ASG not found", { pool, ASG_NAME });
    return;
  }

  const suspended = (asg.SuspendedProcesses ?? []).some(
    (p) => p.ProcessName === "AlarmNotification",
  );
  const tags = asg.Tags ?? [];
  const sinceTag = tags.find((t) => t.Key === "ManualModeSince");
  const alreadyAlerted = tags.some((t) => t.Key === "ManualModeAlerted");

  if (!suspended) {
    // Not in manual mode (or it was released through some other path) —
    // clean up a stale tracking tag if one was somehow left behind.
    if (sinceTag) {
      await autoscaling.send(
        new DeleteTagsCommand({
          Tags: [
            { ResourceId: ASG_NAME, ResourceType: "auto-scaling-group", Key: "ManualModeSince" },
            { ResourceId: ASG_NAME, ResourceType: "auto-scaling-group", Key: "ManualModeAlerted" },
          ],
        }),
      );
    }
    return;
  }

  if (!sinceTag || alreadyAlerted) return;

  const startedAt = new Date(sinceTag.Value);
  if (Number.isNaN(startedAt.getTime())) return;

  const elapsedMinutes = (Date.now() - startedAt.getTime()) / 60000;
  if (elapsedMinutes < ALERT_MINUTES) return;

  const elapsedLabel =
    elapsedMinutes >= 60
      ? `${(elapsedMinutes / 60).toFixed(1)}h`
      : `${Math.round(elapsedMinutes)}m`;

  await notifyAdmins({
    title: `Worker ASG manual mode still active (${pool})`,
    message:
      `${ASG_NAME} (${pool} pool) has had SQS-driven auto-scaling paused for ` +
      `${elapsedLabel} (since ${sinceTag.Value}). Real jobs submitted during this ` +
      `window will queue but not launch a worker. Release from the admin page when done testing.`,
  });

  await autoscaling.send(
    new CreateOrUpdateTagsCommand({
      Tags: [
        {
          ResourceId: ASG_NAME,
          ResourceType: "auto-scaling-group",
          Key: "ManualModeAlerted",
          Value: "true",
          PropagateAtLaunch: false,
        },
      ],
    }),
  );
}
