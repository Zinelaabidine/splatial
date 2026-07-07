"use strict";

/**
 * Outbound transactional email via SES (see infra/modules/static-site/ses.tf
 * for the verified domain identity + DKIM + MAIL FROM setup). Best-effort,
 * like lib/notify.js's admin notifications — a failed send must never break
 * the request that triggered it (a comment, a reaction, a job status change).
 */

const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");

const ses = new SESv2Client({});

const FROM_EMAIL = process.env.NOTIFICATIONS_FROM_EMAIL || "";
const APP_BASE_URL = process.env.APP_BASE_URL || "";

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} params
 */
async function sendEmail({ to, subject, text, html }) {
  if (!FROM_EMAIL) {
    console.error("sendEmail: NOTIFICATIONS_FROM_EMAIL not configured, skipping send");
    return;
  }
  if (!to || typeof to !== "string" || !to.includes("@")) return;

  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: FROM_EMAIL,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: text, Charset: "UTF-8" },
              ...(html ? { Html: { Data: html, Charset: "UTF-8" } } : {}),
            },
          },
        },
      })
    );
  } catch (err) {
    console.error("sendEmail failed", { to, subject, err: err.message });
  }
}

function sceneUrl(sceneId) {
  return APP_BASE_URL ? `${APP_BASE_URL}/scenes/view/${sceneId}` : sceneId;
}

const REACTION_EMOJI = { like: "👍", love: "❤️", wow: "😮", fire: "🔥", haha: "😂" };

/** Email for a social notification (FOLLOW/REACTION/COMMENT/MENTION). */
async function sendSocialNotificationEmail({ to, type, actorDisplayName, sceneId, commentId, reactionType }) {
  const who = actorDisplayName || "Someone";
  let subject;
  let text;

  switch (type) {
    case "FOLLOW":
      subject = `${who} started following you`;
      text = `${who} started following you on Splatial.`;
      break;
    case "REACTION": {
      const emoji = REACTION_EMOJI[reactionType] ?? "👍";
      subject = commentId
        ? `${who} reacted ${emoji} to your comment`
        : `${who} reacted ${emoji} to your scene`;
      text = commentId
        ? `${who} reacted ${emoji} to your comment.\n\n${sceneUrl(sceneId)}`
        : `${who} reacted ${emoji} to your scene.\n\n${sceneUrl(sceneId)}`;
      break;
    }
    case "COMMENT":
      subject = `${who} commented on your scene`;
      text = `${who} left a comment on your scene.\n\n${sceneUrl(sceneId)}`;
      break;
    case "MENTION":
      subject = `${who} mentioned you in a comment`;
      text = `${who} mentioned you in a comment.\n\n${sceneUrl(sceneId)}`;
      break;
    default:
      return;
  }

  await sendEmail({ to, subject, text });
}

/** Email for a training job status change (READY/FAILED). */
async function sendJobStatusEmail({ to, sceneName, sceneId, status, errorMessage }) {
  const name = sceneName || "Your scene";
  if (status === "READY") {
    await sendEmail({
      to,
      subject: `${name} finished processing`,
      text: `${name} has finished training and is ready to view.\n\n${sceneUrl(sceneId)}`,
    });
    return;
  }
  if (status === "FAILED") {
    await sendEmail({
      to,
      subject: `${name} failed to process`,
      text: `${name} failed during processing.${errorMessage ? `\n\nReason: ${errorMessage}` : ""}\n\n${sceneUrl(sceneId)}`,
    });
  }
}

module.exports = { sendEmail, sendSocialNotificationEmail, sendJobStatusEmail };
