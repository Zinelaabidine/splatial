/** Admin user-management types. Mirrors GET/POST /admin/users/* in the backend. */

export type AdminUserStatus = "ACTIVE" | "SUSPENDED" | "BANNED" | "SOFT_DELETED" | "HARD_DELETED";
export type AdminUserTier = "free" | "pro";
/** "user" is implicit — never returned alone as an assignable change, but always a valid display value. */
export type AdminUserRole = "admin" | "moderator" | "beta_tester" | "user";

export type AdminUserSummary = {
  userId: string;
  email: string | null;
  username: string | null;
  displayName: string;
  status: AdminUserStatus;
  tier: AdminUserTier;
  roles: AdminUserRole[];
  joinedAt: string | null;
  scenesCount: number;
  followersCount: number;
};

export type AdminUsersListResponse = {
  items: AdminUserSummary[];
  cursor?: string;
};

export type ListAdminUsersParams = {
  email?: string;
  status?: AdminUserStatus | "";
  tier?: AdminUserTier | "";
  role?: AdminUserRole | "";
  joinedFrom?: string;
  joinedTo?: string;
  sort?: string;
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
};

export type AdminUserProfile = {
  userId: string;
  username: string | null;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  followersCount: number;
  followingCount: number;
  scenesCount: number;
  unreadCount: number;
  createdAt: string;
  email: string | null;
};

export type AdminUserAccount = {
  status: AdminUserStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  hardDeleted: boolean;
};

export type AdminUserCognitoInfo = {
  enabled: boolean;
  userStatus: string;
  userCreateDate: string | null;
  lastModifiedDate: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
};

export type AdminUserUsage = {
  tier: AdminUserTier;
  quotaLimit: number | null;
  usedInWindow: number | null;
  windowDays: number;
  storageCapBytes: number;
  storageUsedBytes: number;
};

export type AdminUserRecentJob = {
  sceneId: string;
  recordType: string;
  name: string | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AuditLogEntry = {
  logId: string;
  targetUserId: string;
  actorAdminId: string;
  actionType: string;
  reason: string | null;
  correlationId: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  createdAt: string | null;
};

export type AdminUserDetail = {
  profile: AdminUserProfile;
  account: AdminUserAccount;
  cognito: AdminUserCognitoInfo | null;
  tier: AdminUserTier;
  roles: AdminUserRole[];
  usage: AdminUserUsage;
  recentJobs: AdminUserRecentJob[];
  recentAuditLogs: AuditLogEntry[];
};

export type AuditLogsResponse = {
  items: AuditLogEntry[];
  cursor?: string;
};

export type ListAuditLogsParams = {
  targetUserId?: string;
  actorAdminId?: string;
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
};

export type UserStatusAction = "suspend" | "ban" | "reactivate";

export type UpdateUserStatusPayload = {
  action: UserStatusAction;
  reason?: string;
};

export type UpdateUserStatusResponse = {
  userId: string;
  status: AdminUserStatus;
  cancelledQueuedJobs: number;
};

export type VerifyOverridePayload = {
  emailVerified?: boolean;
  phoneVerified?: boolean;
  reason: string;
};

export type VerifyOverrideResponse = {
  userId: string;
  emailVerified: boolean;
  phoneVerified: boolean;
};

export type SoftDeletePayload = { reason: string };
export type SoftDeleteResponse = { userId: string; status: AdminUserStatus; cancelledQueuedJobs: number };

export type HardDeletePayload = { reason: string; confirmUserId: string };
export type HardDeleteResponse = { userId: string; status: AdminUserStatus };

export type AssignRolesPayload = { roles: AdminUserRole[]; reason: string };
export type AssignRolesResponse = { userId: string; roles: AdminUserRole[] };

export type ChangePlanPayload = { tier: AdminUserTier; reason: string };
export type ChangePlanResponse = {
  userId: string;
  tier: AdminUserTier;
  quotaLimit: number | null;
  storageCapBytes: number;
  workerPool: string;
};

export type ResetPasswordResponse = { userId: string; status: string };
export type RevokeSessionsResponse = { userId: string; sessionsRevoked: boolean };
