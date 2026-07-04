"use strict";

const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

const sns = new SNSClient({});

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const SNS_TOPIC_ARN = process.env.ADMIN_SNS_TOPIC_ARN || "";

// SNS Subject is capped at 100 chars by the API.
const MAX_SNS_SUBJECT_LENGTH = 100;

/**
 * Best-effort admin notification over Slack (direct webhook POST) and/or SNS
 * (fans out to email subscribers). Never throws — a notification failure
 * must never break the ASG action that triggered it. Silently no-ops if
 * neither SLACK_WEBHOOK_URL nor ADMIN_SNS_TOPIC_ARN is configured.
 *
 * @param {{ title: string, message: string }} params
 */
async function notifyAdmins({ title, message }) {
  const tasks = [];

  if (SLACK_WEBHOOK_URL) {
    tasks.push(
      fetch(SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `*${title}*\n${message}` }),
      })
        .then((res) => {
          if (!res.ok) {
            console.error("notify: slack webhook returned non-2xx", {
              status: res.status,
            });
          }
        })
        .catch((err) => {
          console.error("notify: slack webhook failed", { err: err.message });
        }),
    );
  }

  if (SNS_TOPIC_ARN) {
    tasks.push(
      sns
        .send(
          new PublishCommand({
            TopicArn: SNS_TOPIC_ARN,
            Subject: title.slice(0, MAX_SNS_SUBJECT_LENGTH),
            Message: message,
          }),
        )
        .catch((err) => {
          console.error("notify: sns publish failed", { err: err.message });
        }),
    );
  }

  if (tasks.length === 0) return;
  await Promise.allSettled(tasks);
}

module.exports = { notifyAdmins };
