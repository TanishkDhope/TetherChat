// Tappable reply suggestions rendered above the message input.
// Tapping fills the input (never sends) — the parent decides what happens next.
function SmartReplyChips({ replies = [], loading = false, onPick }) {
  if (!loading && replies.length === 0) return null;

  return (
    <div
      className="bg-gray-50 dark:bg-[#0A2239] px-3 pt-2 flex gap-2 overflow-x-auto [scrollbar-width:none]"
      aria-label="Suggested replies"
      role="group"
    >
      {loading && replies.length === 0
        ? [0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0"
              style={{ width: `${88 + i * 24}px` }}
            />
          ))
        : replies.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => onPick?.(reply)}
              className={`shrink-0 max-w-[70vw] truncate px-3 py-1.5 rounded-full text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 active:scale-95 transition-all cursor-pointer ${
                loading ? "opacity-60" : ""
              }`}
            >
              {reply}
            </button>
          ))}
    </div>
  );
}

export default SmartReplyChips;
