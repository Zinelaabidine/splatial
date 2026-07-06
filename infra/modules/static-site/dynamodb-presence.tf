# ── Presence connections table ──────────────────────────────────────────────
# Backs the viewer's live "who's looking at this scene right now" indicator
# (SceneInfoCard). One item per open WebSocket connection; the scene_id-index
# GSI lists everyone currently connected to a given scene. TTL is a
# belt-and-suspenders cleanup for connections that never received a clean
# $disconnect (crashed tab, lost network, laptop closed) — the heartbeat
# route refreshes expires_at on every ping, connect sets it ~2 minutes out.
#
# NOTE: this table has no data yet — it's created empty alongside the
# WebSocket API in websocket-api.tf. Nothing here is destructive to apply,
# but it is a new billed resource (PAY_PER_REQUEST, so cost scales with
# actual connect/disconnect/heartbeat traffic, not a fixed monthly charge).
resource "aws_dynamodb_table" "presence_connections" {
  provider = aws.this

  name         = "${local.name_prefix}-presence-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connection_id"

  depends_on = [time_sleep.network_iam_propagation]

  attribute {
    name = "connection_id"
    type = "S"
  }

  attribute {
    name = "scene_id"
    type = "S"
  }

  global_secondary_index {
    name = "scene_id-index"

    key_schema {
      attribute_name = "scene_id"
      key_type       = "HASH"
    }

    projection_type = "ALL"
  }

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
    Name        = "${local.name_prefix}-presence-connections"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}
