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
