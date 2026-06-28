# ── GPU Worker networking (us-east-1d / use1-az6) ─────────────────────────────
# Mirrors the legacy spot-instance-us-east-1d-subnet layout inside the app VPC.
# us-east-1d is pinned for lower Spot prices in that AZ.

resource "aws_subnet" "worker_nat_public" {
  provider = aws.this

  vpc_id                  = aws_vpc.static_site.id
  cidr_block              = var.worker_nat_public_subnet_cidr
  availability_zone       = var.worker_spot_availability_zone
  map_public_ip_on_launch = true

  tags = {
    Name        = "${var.name}-worker-nat-public-${var.worker_spot_availability_zone}"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
    Tier        = "public"
  }
}

resource "aws_route_table_association" "worker_nat_public" {
  provider = aws.this

  subnet_id      = aws_subnet.worker_nat_public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_subnet" "worker_spot" {
  provider = aws.this

  vpc_id                  = aws_vpc.static_site.id
  cidr_block              = var.worker_spot_subnet_cidr
  availability_zone       = var.worker_spot_availability_zone
  map_public_ip_on_launch = false

  tags = {
    Name        = "${var.name}-spot-instance-${var.worker_spot_availability_zone}-subnet"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
    Tier        = "worker-spot"
  }
}

resource "aws_eip" "worker_nat" {
  provider = aws.this

  domain = "vpc"

  tags = {
    Name        = "${local.name_prefix}-worker-nat-eip"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}

resource "aws_nat_gateway" "worker" {
  provider = aws.this

  allocation_id = aws_eip.worker_nat.id
  subnet_id     = aws_subnet.worker_nat_public.id

  tags = {
    Name        = "${local.name_prefix}-worker-nat"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }

  depends_on = [aws_internet_gateway.static_site]
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

resource "aws_route" "worker_spot_nat" {
  provider = aws.this

  route_table_id         = aws_route_table.worker_spot.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.worker.id
}

resource "aws_route_table_association" "worker_spot" {
  provider = aws.this

  subnet_id      = aws_subnet.worker_spot.id
  route_table_id = aws_route_table.worker_spot.id
}

# Gateway endpoints keep S3/DynamoDB traffic off the NAT gateway.
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
