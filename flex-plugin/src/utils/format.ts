/** Formats an ISO timestamp for display; falls back to the raw string. */
export function formatTimestamp(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Human-readable footer for the conversation ids attached to a memory item. */
export function formatConversationIds(ids?: string[] | null): string | null {
  if (!ids || ids.length === 0) return null;
  if (ids.length === 1) return `Conversation ${ids[0]}`;
  return `${ids.length} conversations`;
}
