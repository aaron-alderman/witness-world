export function notificationTitle(channel, { subject = null, to = null } = {}) {
  if (channel === "email" && subject) return subject;
  return to || `${channel} notification`;
}

export function notificationReadShape(row) {
  return {
    id: row.id,
    title: row.title,
    channel: row.channel,
    recipient: row.recipient,
    subject: row.subject,
    sender: row.sender,
    preview: row.preview,
    transport: row.transport,
    status: row.status,
    context: row.context,
    jobId: row.jobId,
    providerMessageId: row.providerMessageId,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    retryDelayMs: row.retryDelayMs,
    lastError: row.lastError
  };
}
