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

/** Mirrors GET /admin/asg-config in the backend. */

export type AdminAsgSummary = {
  name: string;
  minSize: number;
  maxSize: number;
  maxSizeCap: number;
  desiredCapacity: number;
  inServiceInstances: number;
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
