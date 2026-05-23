# Architecture



## Table of Contents

*   **1. Executive Summary**
    *   1.1 Project Objectives
    *   1.2 Design Philosophy & Core Principles (Serverless, Spot-first, IaC)
    *   1.3 Summary of Technologies
*   **2. Core Network Infrastructure (VPC)**
    *   2.1 Multi-AZ VPC Design & Subnet Strategy
    *   2.2 Public/Private Split and Internet Access (IGW/NAT Gateways)
    *   2.3 **[Reference Diagram: VPC Core Architecture]** (Image_0)
    *   2.4 Critical Cost Optimization: S3 Gateway Endpoint
*   **3. Overall System Architecture & Workflow**

    *   3.1 Architectural Overview (VPC Integration with Global Services)
    *   3.2 Asynchronous Design Pattern (Decoupling API from Processing)
    *   3.3 Component Responsibility Matrix
    *   3.4 **[Reference Diagram: Full Application Architecture]** (Image_2)
    *   3.5 Detailed End-to-End Workflows
        *   3.5.1 The Management Flow (Webapp & API)
        *   3.5.2 The Training Flow (EC2 Spot Workers)
        *   3.5.3 The Output/Viewing Flow
*   **4. Security and Identity Management (Cognito & API Gateway)**
    *   4.1 Authentication & Authorization Strategy
    *   4.2 Integrated **[Reference Diagram: Compact API Auth Workflow]** (Image_4)
    *   4.3 Secure Token Validation Path
    *   4.4 Principle of Least Privilege: IAM Roles for Lambdas & EC2
    *   4.5 Security Groups Configuration Matrix
*   **5. Compute Layer: Heavy Data Processing (GPU Workers)**
    *   5.1 Choosing EC2 G4dn/G5 Spot Instances
    *   5.2 Auto Scaling Group (ASG) Design & Mixed Instances Policy
    *   5.3 Handling Spot Interruptions Gracefully
        *   5.3.1 S3 Checkpointing Mechanism
        *   5.3.2 SQS Message Re-queuing
*   **6. Advanced DevOps Practices**
    *   6.1 Terraform Project Structure & Workspace Use (`dev`/`prod`)
    *   6.2 CI/CD Strategy with GitHub Actions
        *   6.2.1 Infrastructure CI/CD flow
        *   6.2.2 Application/Worker CI/CD flow
    *   6.3 Secret Management
*   **7. Scalability & Cost Governance**
    *   7.1 Cost Pillars and Monthly Estimate Assumptions
    *   7.2 Scaling Rules (Lambda Concurrency vs. ASG GPU counts)
*   **8. Limitations & Assumptions**


## 1. Executive Summary 

## 2. Core Network Infrastructure (VPC)

## 3. Overall System Architecture & Workflow
   Architecture ![The main architecture](images/architecture.jpg)

### 3.1 Architectural Overview (VPC Integration with Global Services)
### 3.2 Asynchronous Design Pattern (Decoupling API from Processing)

The pipeline separates the **submission tier** (API Gateway + Lambda) from the **compute tier** (EC2 Spot GPU workers) via an SQS standard queue. This means the HTTP response to the client is immediate (`202 Accepted / QUEUED`), while the actual GPU training runs asynchronously and can take tens of minutes.

```
Client
  │
  ├─ PUT (pre-signed URL) ──────────────────────────────► S3 (raw-scenes bucket)
  │
  └─ POST /upload/complete ─► API Gateway ─► Upload Lambda
                                                   │
                                          ┌────────┴──────────┐
                                          │ DynamoDB           │
                                          │ status → QUEUED    │
                                          └────────────────────┘
                                                   │
                                          ┌────────▼──────────┐
                                          │ SQS               │
                                          │ splat-processing  │
                                          │ -queue            │
                                          └────────┬──────────┘
                                                   │  (long-poll)
                                    ┌──────────────▼──────────────────┐
                                    │  Auto Scaling Group              │
                                    │  GPU Spot Workers (g4dn.xlarge) │
                                    │  • Pull message from SQS        │
                                    │  • Download from S3             │
                                    │  • Run 3DGS training            │
                                    │  • Upload artifacts to S3       │
                                    │  • Update DynamoDB → COMPLETED  │
                                    │  • Delete SQS message           │
                                    └─────────────────────────────────┘
                                                   │  (on failure)
                                    ┌──────────────▼──────────────────┐
                                    │  SQS Dead Letter Queue (DLQ)    │
                                    │  After maxReceiveCount = 3       │
                                    └─────────────────────────────────┘
```

**Why SQS over direct Lambda invocation:** Workers can run for 30–90 minutes; Lambda has a 15-minute limit. SQS also provides built-in retry semantics and DLQ isolation for failed jobs without custom retry logic.

### 3.3 Component Responsibility Matrix

| Component | Responsibility |
|---|---|
| API Gateway HTTP API | JWT-authenticated entry point; routes to Lambda |
| Upload Lambda | Multipart S3 coordination; DynamoDB writes; SQS `SendMessage` |
| SQS Main Queue | Job buffer; visibility timeout = 45 min; decouples API from compute |
| SQS DLQ | Captures messages that failed 3 receive attempts |
| ASG (Target Tracking) | Scales workers 0→N based on `ApproximateNumberOfMessagesVisible` |
| EC2 Spot Workers | Long-polling loop; downloads from S3; runs Gaussian Splatting; updates DynamoDB |
| DynamoDB ScenesTable | Single source of truth for job state machine |
| S3 raw-scenes | Input storage (Transfer Acceleration enabled) and output artifacts |

### 3.4 **[Reference Diagram: Full Application Architecture]** (Image_2)
### 3.5 Detailed End-to-End Workflows
#### 3.5.1 Identity, Secure Access and Profile Workflow
##### Sign-up: 
User registers via the React frontend. AWS Cognito User Pool creates the identity, verifies the email, and triggers a Post-Confirmation Lambda function.

##### Profile Creation: 
The Lambda function initializes a user record in DynamoDB (e.g., UsersTable), setting default Tier (e.g., "Free", "Pro") and quota limits (e.g., max Scenes per month).

##### Login: 
User authenticates via Cognito, receiving ID, Access, and Refresh JWTs.

##### Token Refresh: 
Frontend silently refreshes expired tokens using the Refresh token to maintain session continuity.

#####  Request Verification: 
Frontend calls API Gateway passing the JWT in the Authorization header.

##### API Gateway Authorizer: 
API Gateway validates the JWT via a native Cognito Authorizer. Invalid/expired tokens are rejected (401 Unauthorized).

##### Quota Check (Edge Case): 
A VPC-integrated Lambda checks DynamoDB to ensure the user hasn't exceeded their daily/monthly Scene processing quotas. If exceeded, returns a 429 Too Many Requests response

#### 3.5.1 API Authorization

#### 3.5.3 Scene Ingestion Worklow
##### Request Upload
##### Multipart Upload Initialization
##### Direct-to-S3 Upload & Assembly

#### 3.5.2 Job Scheduling & Orchestration Workflow

1. Client calls `POST /upload/complete` with `{ uploadId, key, sceneId, parts }`.
2. Upload Lambda assembles the S3 multipart upload, updates DynamoDB `status → QUEUED`, and sends `{ jobId: sceneId, s3Key: key }` to the SQS main queue.
3. A worker instance (or a new instance spun up by the ASG) long-polls SQS (`WaitTimeSeconds=20`).
4. Upon receiving the message, the worker checks DynamoDB. If `status == CANCELLED`, it deletes the message and continues polling.
5. Otherwise it sets `status → PROCESSING`, runs the 3DGS training job, then sets `status → COMPLETED` and deletes the SQS message.
6. If the worker crashes or the Spot instance is interrupted, the SQS message becomes visible again after the 45-minute visibility timeout. After 3 failed receives it routes to the DLQ.

**Job cancellation flow:** Client calls `POST /jobs/{sceneId}/cancel`. The Lambda sets `status → CANCELLED` in DynamoDB. The next time the worker polls and finds this scene ID, it skips processing and deletes the message.
#### 3.5.4 Spot Interruption & Recovery Workflow
#### 3.5.5 Splat Training Workflow (EC2 Spot Workers)
#### 3.5.6 Visualization & Splat Management Workflow
#### 3.5.7 Data Lifecycle & Cleanup Workflow

## 4. Security and Identity Management (Cognito & API Gateway)
## 5. Compute Layer: Heavy Data Processing (GPU Workers)

### 5.1 Choosing EC2 G4dn/G5 Spot Instances

3DGS training requires CUDA-capable GPUs. The `g4dn.xlarge` (NVIDIA T4, 16 GB VRAM) is the baseline instance type — cost-effective on Spot (~70% savings vs. On-Demand). For longer scenes, `g4dn.2xlarge` or `g5.xlarge` (A10G) can be specified via the `worker_instance_type` variable without any infrastructure changes.

Spot interruptions are tolerated by the SQS visibility timeout: if a worker is interrupted before deleting the message, the message reappears in the queue after 45 minutes and is picked up by another instance. Training checkpoints (saved to S3) allow partial restarts.

### 5.2 Auto Scaling Group (ASG) Design & Mixed Instances Policy

The ASG uses a **Target Tracking Scaling Policy** tied to the SQS `ApproximateNumberOfMessagesVisible` metric with a target value of `1` (one worker per queued job). The ASG scales between `min=0` and `max=5`.

- **Scale-out**: When a job is enqueued and no instances are running, the ASG launches a Spot instance. Cold-start time is ~3–5 minutes (AMI boot + `splat-worker.service` start).
- **Scale-in**: When the queue is empty, the ASG terminates idle workers (scale-in enabled), driving compute cost to zero between jobs.
- **IMDSv2**: Required on all worker instances to prevent SSRF-based credential theft.

### 5.3 Handling Spot Interruptions Gracefully

#### 5.3.1 S3 Checkpointing Mechanism

The 3DGS training process periodically saves intermediate `.ply` checkpoints to S3. If interrupted, the next worker can resume from the last checkpoint rather than restarting from scratch, significantly reducing wasted GPU time.

#### 5.3.2 SQS Message Re-queuing

The worker does **not** extend the visibility timeout during processing (the 45-minute window is the safety margin). On Spot interruption, AWS sends a 2-minute warning via the instance metadata endpoint (`/latest/meta-data/spot/termination-time`). A well-implemented worker can catch this signal, save its checkpoint, and allow the message to re-appear in the queue automatically without any additional API calls.
## 6. Advanced DevOps Practices
## 7. Scalability & Cost Governance
## 8. Limitations & Assumptions


