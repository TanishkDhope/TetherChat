// Rule-based smart replies. Used by the /suggest-replies route when the model
// service is asleep or erroring, so the chips never disappear mid-demo. It is
// also the "rule-based baseline" in the three-way comparison from
// SmartReplies/Smart-Replies-Plan.md §4. Pure and deterministic.

const RULES = [
  {
    test: /\b(hi|hey|hello|yo|good (morning|afternoon|evening))\b/i,
    replies: ["Hey! How are you?", "Hi! What's up?", "Hello!"],
  },
  {
    test: /\b(thanks|thank you|thx|ty)\b/i,
    replies: ["You're welcome!", "No problem!", "Anytime!"],
  },
  {
    test: /\b(sorry|apolog)/i,
    replies: ["No worries!", "It's okay.", "Don't worry about it."],
  },
  {
    test: /\b(meeting|call|schedule|tomorrow|tonight|later|at \d{1,2}(:\d{2})?\s?(am|pm)?)\b/i,
    replies: ["Sounds good.", "What time works for you?", "Let me check and get back to you."],
  },
  {
    test: /\b(can you|could you|would you|will you|are you|do you|did you)\b.*\?/i,
    replies: ["Yes, sure!", "Not sure, let me check.", "Sorry, I can't right now."],
  },
  {
    test: /\?\s*$/,
    replies: ["Yes!", "I'm not sure.", "Let me get back to you."],
  },
  {
    test: /\b(bye|see you|good ?night|talk later|ttyl)\b/i,
    replies: ["See you!", "Bye! Take care.", "Talk soon!"],
  },
  {
    test: /\b(congrat|great news|got the job|passed)\b/i,
    replies: ["Congratulations!", "That's great news!", "So happy for you!"],
  },
];

const DEFAULT_REPLIES = ["Okay!", "Sounds good.", "Let me get back to you."];

/**
 * @param {{ role: "other" | "me", text: string }[]} turns
 * @param {number} n
 * @returns {string[]}
 */
export function fallbackReplies(turns, n = 3) {
  const last = [...turns].reverse().find((t) => t.role === "other");
  if (!last) return [];
  const text = last.text.trim();
  const rule = RULES.find((r) => r.test.test(text));
  return (rule ? rule.replies : DEFAULT_REPLIES).slice(0, n);
}
