export function notificationTitle(channel, { subject = null, to = null } = {}) {
  if (channel === "email" && subject) return subject;
  return to || `${channel} notification`;
}
