# ── GPU Worker networking ─────────────────────────────────────────────────────
# Dedicated public subnet in worker_spot_dedicated_availability_zone (default
# us-east-1d) with S3/DynamoDB gateway endpoints. Other worker_spot_availability_zones
# use the module's existing public subnets; the ASG mixed-instances policy lets EC2
# Fleet pick the best AZ via price-capacity-optimized Spot allocation.
#
# Worker subnet is public (direct IGW route, public IP per instance) rather than
# NAT-gated. The worker SG is outbound-only with zero inbound rules (management
# is via SSM), so a public IP adds no reachable surface area — it just avoids
# paying for a NAT Gateway (~$32.85/mo) + its EIP (~$3.65/mo) 24/7 to serve an
# ASG that sits at desired_capacity = 0 most of the time. Cost becomes usage
# based: $0.005/hr per public IPv4, billed only while a worker instance runs.

resource "aws_subnet" "worker_spot" {
  provider = aws.this

  vpc_id                  = aws_vpc.static_site.id
  cidr_block              = var.worker_spot_subnet_cidr
  availability_zone       = var.worker_spot_dedicated_availability_zone
  map_public_ip_on_launch = true

  tags = {
    Name        = "${var.name}-spot-instance-${var.worker_spot_dedicated_availability_zone}-subnet"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
    Tier        = "public"
  }
}

resource "aws_route_table" "worker_spot" {
  provider = aws.this

  vpc_id = aws_vpc.static_site.id

  tags = {
    Name        = "${local.name_prefix}-worker-spot-rt"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}

resource "aws_route" "worker_spot_igw" {
  provider = aws.this

  route_table_id         = aws_route_table.worker_spot.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.static_site.id
}

# NAT → IGW migration: keep the same route resource so Terraform calls
# ReplaceRoute instead of destroy+create (which races on 0.0.0.0/0).
moved {
  from = aws_route.worker_spot_nat
  to   = aws_route.worker_spot_igw
}

resource "aws_route_table_association" "worker_spot" {
  provider = aws.this

  subnet_id      = aws_subnet.worker_spot.id
  route_table_id = aws_route_table.worker_spot.id
}

# Gateway endpoints keep S3/DynamoDB traffic off the public internet path and
# free of any data-processing charge, regardless of the subnet being public.
resource "aws_vpc_endpoint" "s3" {
  provider = aws.this

  vpc_id            = aws_vpc.static_site.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.worker_spot.id]

  tags = {
    Name        = "${local.name_prefix}-s3-gateway-endpoint"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}

resource "aws_vpc_endpoint" "dynamodb" {
  provider = aws.this

  vpc_id            = aws_vpc.static_site.id
  service_name      = "com.amazonaws.${var.aws_region}.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.worker_spot.id]

  tags = {
    Name        = "${local.name_prefix}-dynamodb-gateway-endpoint"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}
