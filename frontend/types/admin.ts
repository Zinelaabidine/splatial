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
};

export type AdminAttemptsResponse = {
  items: AdminAttempt[];
  cursor?: string;
};
