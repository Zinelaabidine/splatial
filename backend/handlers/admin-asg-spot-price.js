"use strict";

const {
  EC2Client,
  DescribeSpotPriceHistoryCommand,
} = require("@aws-sdk/client-ec2");
const response = require("../lib/response");
const { isAdmin } = require("../lib/admin-auth");

const ec2 = new EC2Client({});

const INSTANCE_TYPE_RE = /^[a-z0-9]+\.[a-z0-9]+$/;
const LOOKBACK_MS = 60 * 60 * 1000; // 1 hour is enough to catch the latest price per AZ
// Restrict to the AZs the worker ASG is actually allowed to launch into
// (see var.worker_spot_availability_zones) — otherwise this returns pricing
// for AZs the fleet will never use.
const ALLOWED_AZS = (process.env.WORKER_SPOT_AZS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * GET /admin/asg/spot-price?instanceType=g5g.xlarge
 *
 * Admin-only. Live-ish Spot price lookup (last hour of history, Linux/UNIX)
 * shown before an admin applies an instance type change or does a manual
 * boot — context for cost, not a guarantee (Spot prices change continuously
 * and price-capacity-optimized may pick a different AZ than the cheapest
 * one shown here if it lacks capacity).
 *
 * Success (200): { instanceType, prices: [{ az, pricePerHour, timestamp }], cheapest }
 */
exports.handler = async (event) => {
  if (!isAdmin(event)) {
    return response(403, { error: "Forbidden: admin role required" });
  }

  const instanceType = (event.queryStringParameters?.instanceType || "").trim();
  if (!instanceType || !INSTANCE_TYPE_RE.test(instanceType)) {
    return response(400, { error: "instanceType must look like g5g.xlarge" });
  }

  const out = await ec2.send(
    new DescribeSpotPriceHistoryCommand({
      InstanceTypes: [instanceType],
      ProductDescriptions: ["Linux/UNIX"],
      StartTime: new Date(Date.now() - LOOKBACK_MS),
      MaxResults: 100,
    }),
  );

  // Keep only the most recent entry per AZ.
  const latestByAz = {};
  for (const entry of out.SpotPriceHistory ?? []) {
    const az = entry.AvailabilityZone;
    if (!az) continue;
    if (ALLOWED_AZS.length > 0 && !ALLOWED_AZS.includes(az)) continue;
    const ts = entry.Timestamp ? new Date(entry.Timestamp).getTime() : 0;
    if (!latestByAz[az] || ts > latestByAz[az]._ts) {
      latestByAz[az] = {
        az,
        pricePerHour: Number(entry.SpotPrice),
        timestamp: entry.Timestamp ? new Date(entry.Timestamp).toISOString() : null,
        _ts: ts,
      };
    }
  }

  const prices = Object.values(latestByAz)
    .map(({ az, pricePerHour, timestamp }) => ({ az, pricePerHour, timestamp }))
    .sort((a, b) => a.pricePerHour - b.pricePerHour);

  return response(200, {
    instanceType,
    prices,
    cheapest: prices[0] ?? null,
  });
};
