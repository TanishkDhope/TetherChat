// Adapter between the chat's message objects and the storage-agnostic
// smart-replies wire contract ({ role: "other" | "me", text }).
//
// `isMine` is the only thing that knows how a message identifies its sender.
// Today that is `m.sender === displayName`; after the Postgres migration it
// becomes `m.senderId === uid` — a one-line change at the call site.

export const MAX_TURNS = 6;

export function toTurns(messages, isMine, { maxTurns = MAX_TURNS } = {}) {
  const turns = [];
  for (const m of messages) {
    if (!m || m.type === "sticker") continue;
    const text = typeof m.text === "string" ? m.text.trim() : "";
    if (!text) continue;
    turns.push({ role: isMine(m) ? "me" : "other", text: text.slice(0, 500) });
  }
  if (turns.length === 0 || turns[turns.length - 1].role === "me") return [];
  return turns.slice(-maxTurns);
}
