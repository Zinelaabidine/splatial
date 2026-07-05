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
 * Workers have no inbound security group rules or SSH key pair by design —
 * access is exclusively via SSM Session Manager. ssmCommand/consoleUrl are
 * the only connection info the backend ever returns (no SSH host/key).
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

export type AdminAsgConfigResponse = {
  asg: AdminAsgSummary;
  launchTemplate: AdminLaunchTemplateSummary;
  current: AdminAsgCurrent;
  history: AdminAsgHistoryItem[];
  queue: AdminQueueDepth;
};

export type UpdateAsgConfigPayload = {
  amiId?: string;
  instanceType?: string;
  maxSize?: number;
  reason?: string;
};

export type UpdateAsgConfigResponse = {
  launchTemplateVersion?: number;
  amiId?: string;
  instanceType?: string;
  maxSize?: number;
};

export type BootWorkerPayload = {
  count?: number;
  reason?: string;
};

export type BootWorkerResponse = {
  desiredCapacity: number;
  manualModeActive: boolean;
};

export type ReleaseWorkerResponse = {
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
