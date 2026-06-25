# AWS Auto-Configuration
# ----------------------------
import os
import requests
import boto3


def auto_configure_aws_environment():
    """
    Replaces the external shell script by auto-discovering:
    1. IMDSv2 Token
    2. AWS Region
    3. IAM Role (for logging/debug)
    4. SQS Queue URLs
    Sets these as environment variables so the rest of the script works unchanged.
    """
    # 1. Default Configuration (matches your shell script exports)
    defaults = {
        "API_BASE_URL": "https://api-dev.openspacenexus.store",
        "WORKER_POLL_INTERVAL_SECONDS": "20",
        "VISIBILITY_EXTENSION_INTERVAL_SECONDS": "150",
        "VISIBILITY_TIMEOUT_SECONDS": "30",
        "HEARTBEAT_INTERVAL_SECONDS": "30",
        "DELETE_INVALID_MESSAGES": "true"
    }
    
    for key, val in defaults.items():
        if key not in os.environ:
            os.environ[key] = val
            # print(f"Set default {key}={val}")

    # If SQS_QUEUE_URL is already set, assume we are running locally or manually configured
    if "SQS_QUEUE_URL" in os.environ:
        return

    print("Auto-configuring from AWS Environment...")
    
    # Session for requests with timeout
    http = requests.Session()
    
    try:
        # 2. Get IMDSv2 Token
        # curl -sX PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"
        token_resp = http.put(
            "http://169.254.169.254/latest/api/token",
            headers={"X-aws-ec2-metadata-token-ttl-seconds": "21600"},
            timeout=2
        )
        token_resp.raise_for_status()
        token = token_resp.text
        imds_headers = {"X-aws-ec2-metadata-token": token}
        
        # 3. Get IAM Role Name (Just for verification/logging as requested)
        # curl -sH "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/security-credentials/
        role_resp = http.get(
            "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
            headers=imds_headers,
            timeout=2
        )
        if role_resp.status_code == 200:
            role_name = role_resp.text.strip()
            print(f"Detected IAM Role: {role_name}")

        # 4. Get AWS Region
        # curl ... /latest/dynamic/instance-identity/document
        identity_resp = http.get(
            "http://169.254.169.254/latest/dynamic/instance-identity/document",
            headers=imds_headers,
            timeout=2
        )
        identity_resp.raise_for_status()
        region = identity_resp.json().get("region")
        
        if region:
            os.environ["AWS_REGION"] = region
            os.environ["AWS_DEFAULT_REGION"] = region # Helps boto3 find the region automatically
            print(f"Detected Region: {region}")

            # 5. Get SQS Queue URLs using boto3 (replaces aws sqs get-queue-url)
            sqs_client = boto3.client("sqs", region_name=region)
            
            try:
                q_resp = sqs_client.get_queue_url(QueueName=os.getenv("QUEUE_NAME", "splatial-dev-splat-processing-queue"))
                queue_url = q_resp["QueueUrl"]
                os.environ["SQS_QUEUE_URL"] = queue_url
                print(f"Discovered Queue URL: {queue_url}")
            except Exception as e:
                print(f"Error finding main queue: {e}")

            try:
                dlq_resp = sqs_client.get_queue_url(QueueName=os.getenv("DLQ_NAME", "splatial-dev-splat-processing-dlq"))
                os.environ["DLQURL"] = dlq_resp["QueueUrl"]
                # print(f"Discovered DLQ URL: {dlq_resp['QueueUrl']}")
            except Exception:
                pass # DLQ might not exist or isn't strictly required
                
    except Exception as e:
        print(f"AWS Auto-configuration failed (running locally?): {e}")

# EXECUTE CONFIGURATION
auto_configure_aws_environment()
