/** Admin overview types. Mirrors GET /admin/attempts in the backend. */

export type AdminAttempt = {
  attemptId: string;
  parentSceneId: string | null;
  sceneName?: string | null;
  userId: string | null;
  attemptNumber: number | null;
  status: string;
  ec2InstanceId: string | null;
  spotRequestId: string | null;
  failureReason: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  // Progress fields (from the backend's mapProgressFromItem).
  progressPhase?: string;
  progressPercent?: number;
  progressSubPhase?: string;
  progressEtaSeconds?: number;
  /** worker.py version that processed this attempt. */
  workerVersion?: string;
};

export type AdminAttemptsResponse = {
  items: AdminAttempt[];
  cursor?: string;
};

/** Mirrors GET /admin/asg-config in the backend. */

/**
 * Workers are SSM-managed by default, so ssmCommand/consoleUrl are always
 * populated. sshCommand is only non-null in environments that opt into direct
 * SSH (worker_ssh_key_name + worker_ssh_allowed_cidr both set — dev only as
 * of this writing); everywhere else it's null.
 */
export type AdminAsgInstance = {
  instanceId: string;
  lifecycleState: string;
  healthStatus: string | null;
  availabilityZone: string | null;
  instanceType: string | null;
  privateIp: string | null;
  publicIp: string | null;
  launchTime: string | null;
  ssmCommand: string;
  sshCommand: string | null;
  consoleUrl: string;
};

export type AdminAsgSummary = {
  name: string;
  minSize: number;
  maxSize: number;
  maxSizeCap: number;
  desiredCapacity: number;
  inServiceInstances: number;
  /** True while a manual "boot a worker now" test session is active. */
  manualModeActive: boolean;
  /** ISO timestamp of when the current manual session started, or null. */
  manualModeSince: string | null;
  instances: AdminAsgInstance[];
};

export type AdminQueueDepth = {
  visible: number | null;
  inFlight: number | null;
};

export type AdminLaunchTemplateSummary = {
  id: string;
  latestVersion: number | null;
  defaultVersion: number | null;
};

export type AdminAsgCurrent = {
  amiId: string | null;
  amiName: string | null;
  amiState: string | null;
  architecture: string | null;
  instanceType: string | null;
  versionDescription: string | null;
};

export type AdminAsgHistoryItem = {
  version: number;
  isDefault: boolean;
  amiId: string | null;
  instanceType: string | null;
  description: string | null;
  createdAt: string | null;
};

/**
 * Two GPU worker pools: "standard" (free tier, Spot) and "priority" (paid
 * tier, On-Demand — see compute-priority.tf). Every ASG-related admin call
 * takes/returns which pool it targeted; omitting `pool` on a request
 * defaults to "standard" on the backend.
 */
export type WorkerPool = "standard" | "priority";

export type AdminAsgConfigResponse = {
  pool: WorkerPool;
  asg: AdminAsgSummary;
  launchTemplate: AdminLaunchTemplateSummary;
  current: AdminAsgCurrent;
  history: AdminAsgHistoryItem[];
  queue: AdminQueueDepth;
};

export type UpdateAsgConfigPayload = {
  pool?: WorkerPool;
  amiId?: string;
  instanceType?: string;
  maxSize?: number;
  reason?: string;
};

export type UpdateAsgConfigResponse = {
  pool: WorkerPool;
  launchTemplateVersion?: number;
  amiId?: string;
  instanceType?: string;
  maxSize?: number;
};

export type BootWorkerPayload = {
  pool?: WorkerPool;
  count?: number;
  reason?: string;
};

export type BootWorkerResponse = {
  pool: WorkerPool;
  desiredCapacity: number;
  manualModeActive: boolean;
};

export type ReleaseWorkerResponse = {
  pool: WorkerPool;
  desiredCapacity: number;
  manualModeActive: boolean;
};

export type SpotPriceEntry = {
  az: string;
  pricePerHour: number;
  timestamp: string | null;
};

export type SpotPriceResponse = {
  instanceType: string;
  prices: SpotPriceEntry[];
  cheapest: SpotPriceEntry | null;
};

/** Worker AMI registry — mirrors GET /admin/worker-amis in the backend. */
export type WorkerAmi = {
  amiId: string;
  label: string;
  baseAmiId: string | null;
  architecture: string | null;
  reason: string | null;
  registeredAt: string | null;
  registeredBy: string | null;
  lastBootInstanceId: string | null;
  lastBootAt: string | null;
};

export type WorkerAmisResponse = {
  items: WorkerAmi[];
  currentAmiId: string | null;
};

export type RegisterWorkerAmiRequest = {
  amiId: string;
  label: string;
  baseAmiId?: string;
  reason?: string;
};

export type BootWorkerAmiResponse = {
  amiId: string;
  instanceId: string;
};

export type ActivateWorkerAmiResponse = {
  currentAmiId: string;
  note: string;
};
