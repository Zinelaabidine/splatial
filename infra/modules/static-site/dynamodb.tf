resource "aws_dynamodb_table" "scenes" {
  provider = aws.this

  name         = "${local.name_prefix}-scenes"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "scene_id"

  # Wait for the deploy-role policy update AND the IAM propagation delay before
  # attempting to create this table. See time_sleep.iam_propagation in
  # iam-github-oidc.tf for the rationale.
  depends_on = [time_sleep.iam_propagation]

  attribute {
    name = "scene_id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "visibility"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  attribute {
    name = "public_owner_id"
    type = "S"
  }

  attribute {
    name = "raw_retention_status"
    type = "S"
  }

  attribute {
    name = "raw_expires_at"
    type = "S"
  }

  attribute {
    name = "lease_status"
    type = "S"
  }

  attribute {
    name = "lease_expires_at"
    type = "S"
  }

  # GSI for listing a user's scenes by status (e.g. PENDING_UPLOAD, READY).
  global_secondary_index {
    name = "user_id-status-index"

    key_schema {
      attribute_name = "user_id"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "status"
      key_type       = "RANGE"
    }

    projection_type = "KEYS_ONLY"
  }

  # GSI for listing public scenes newest-first (explore / feed).
  global_secondary_index {
    name = "visibility-created_at-index"

    key_schema {
      attribute_name = "visibility"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "created_at"
      key_type       = "RANGE"
    }

    projection_type = "ALL"
  }

  # Sparse GSI: public_owner_id is set only on PUBLIC scenes — lists each owner's public scenes.
  global_secondary_index {
    name = "public_owner-created_at-index"

    key_schema {
      attribute_name = "public_owner_id"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "created_at"
      key_type       = "RANGE"
    }

    projection_type = "ALL"
  }

  # Sparse GSI: raw_retention_status is set (to "PENDING") only on scenes with
  # a raw source pending deletion — written by attempt-patch.js on a
  # successful training completion (see lib/retention.js for the per-tier
  # window), removed by retention-sweep.js once swept. Lets the daily
  # retention job Query "everything due" directly instead of a full Scan;
  # raw_size_bytes/output_size_bytes (see storage-quota.js) aren't key
  # attributes so they don't need a declared `attribute` block here.
  global_secondary_index {
    name = "raw_retention_status-raw_expires_at-index"

    key_schema {
      attribute_name = "raw_retention_status"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "raw_expires_at"
      key_type       = "RANGE"
    }

    projection_type = "KEYS_ONLY"
  }

  # Sparse GSI: lease_status is set (to "ACTIVE") only while a worker is holding
  # a claim on a training attempt — written by attempt-patch.js when the worker
  # reports RUNNING, renewed by attempt-heartbeat.js, and REMOVEd on every
  # terminal or requeued status (see backend/lib/attempt-lease.js). The index
  # therefore contains exactly the set of live claims, letting attempts-reap.js
  # Query "every claim past its deadline" instead of scanning the table.
  #
  # A worker that is merely Spot-interrupted re-enqueues itself and clears its
  # own lease, so it never appears here. What this index catches is the case no
  # worker-side code can: a hard crash, OOM kill, or Spot hardware termination
  # that sends no PATCH at all, leaving the attempt PROCESSING forever.
  #
  # Single-value hash key, so all entries share one partition — the same
  # trade-off already accepted by raw_retention_status-raw_expires_at-index
  # above, and sound at this job volume. If concurrent training ever grows
  # enough to make it hot, shard the value ("ACTIVE#<0-9>") and have the reaper
  # Query each shard.
  global_secondary_index {
    name = "lease_status-lease_expires_at-index"

    key_schema {
      attribute_name = "lease_status"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "lease_expires_at"
      key_type       = "RANGE"
    }

    projection_type = "KEYS_ONLY"
  }

  # TTL: Lambda sets `expires_at` (epoch seconds) on every record.
  # PENDING_UPLOAD records expire after 24 h; PROCESSING after 7 days.
  # DynamoDB deletes expired items within ~48 h — no Lambda cleanup needed.
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "${local.name_prefix}-scenes"
    Environment = var.environment
    Project     = var.project_name
  }
}
