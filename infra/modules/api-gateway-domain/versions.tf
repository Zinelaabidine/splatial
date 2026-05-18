terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"

      # Two provider aliases are required:
      #   aws.this      – the primary region where the API Gateway lives.
      #   aws.us_east_1 – us-east-1, mandatory for ACM certificates used by
      #                   edge-optimised API Gateway custom domains.
      configuration_aliases = [
        aws.this,
        aws.us_east_1,
      ]
    }
  }
}
