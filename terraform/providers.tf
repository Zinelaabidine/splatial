provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "hello-world-static-site"
      Environment = "prod"
      ManagedBy   = "terraform"
    }


  }
}