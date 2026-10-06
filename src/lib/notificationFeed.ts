import type { NotificationRow } from "./notificationRules";

export function mergeNotificationRow(rows: NotificationRow[], incoming: NotificationRow, limit = 50): NotificationRow[] {
  const existing = rows.find((row) => row.id === incoming.id);
  return [{ ...existing, ...incoming }, ...rows.filter((row) => row.id !== incoming.id)]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)
    .slice(0, limit);
}
