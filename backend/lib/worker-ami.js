"use strict";

/**
 * Shared helpers for the admin worker-AMI registry (DynamoDB table
 * WORKER_AMIS_TABLE_NAME — see infra/modules/static-site/dynamodb-worker-amis.tf).
 *
 * Item shape (per registered AMI):
 *   ami_id (S, hash key), label (S), base_ami_id (S), architecture (S),
 *   reason (S), registered_at (S ISO), registered_by (S userId),
 *   last_boot_instance_id (S), last_boot_at (S)
 *
 * A sentinel item (ami_id = CURRENT_POINTER_KEY) holds the registry's
 * app-level "current AMI" pointer. This is UI/registry metadata only — it
 * never mutates the live ASG Launch Template (see admin-worker-amis.tf).
 */

const CURRENT_POINTER_KEY = "__CURRENT__";

// AMI IDs are ami- followed by 8 (legacy) or 17 (current) lowercase hex chars.
const AMI_ID_RE = /^ami-[0-9a-f]{8,17}$/;

function isValidAmiId(amiId) {
  return typeof amiId === "string" && AMI_ID_RE.test(amiId.trim());
}

function workerAmiFromItem(item) {
  if (!item) return null;
  return {
    amiId: item.ami_id?.S ?? "",
    label: item.label?.S ?? "",
    baseAmiId: item.base_ami_id?.S ?? null,
    architecture: item.architecture?.S ?? null,
    reason: item.reason?.S ?? null,
    registeredAt: item.registered_at?.S ?? null,
    registeredBy: item.registered_by?.S ?? null,
    lastBootInstanceId: item.last_boot_instance_id?.S ?? null,
    lastBootAt: item.last_boot_at?.S ?? null,
  };
}

module.exports = { CURRENT_POINTER_KEY, isValidAmiId, workerAmiFromItem };
