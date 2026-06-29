import { REACTIONS, REACTION_ORDER } from "@/lib/reactions/constants";
import type { AppNotification, NotificationType, ReactionType } from "@/types/api";

function actorHandle(notification: AppNotification): string {
  return notification.actorUsername.trim().toLowerCase();
}

export function notificationHref(notification: AppNotification): string {
  const handle = actorHandle(notification);
  switch (notification.type) {
    case "FOLLOW":
      return `/u/${encodeURIComponent(handle)}`;
    case "REACTION":
    case "COMMENT":
    case "MENTION":
      return notification.sceneId
        ? `/scenes/view?id=${encodeURIComponent(notification.sceneId)}`
        : "/notifications";
    default:
      return "/notifications";
  }
}

export function reactionEmoji(reactionType: string | undefined): string {
  if (
    reactionType &&
    REACTION_ORDER.includes(reactionType as ReactionType)
  ) {
    return REACTIONS[reactionType as ReactionType].emoji;
  }
  return REACTIONS.like.emoji;
}

type NotificationMessageParts = {
  prefix: string;
  actorLabel: string;
  suffix: string;
};

export function notificationMessageParts(
  notification: AppNotification,
): NotificationMessageParts {
  const actorLabel = `@${actorHandle(notification)}`;

  switch (notification.type as NotificationType) {
    case "FOLLOW":
      return { prefix: "", actorLabel, suffix: " started following you" };
    case "REACTION":
      return {
        prefix: "",
        actorLabel,
        suffix: ` reacted ${reactionEmoji(notification.reactionType)} to your scene`,
      };
    case "COMMENT":
      return { prefix: "", actorLabel, suffix: " commented on your scene" };
    case "MENTION":
      return {
        prefix: "",
        actorLabel,
        suffix: " mentioned you in a comment",
      };
    default:
      return { prefix: "", actorLabel, suffix: " sent you a notification" };
  }
}

export function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return (name.slice(0, 2) || "?").toUpperCase();
}
