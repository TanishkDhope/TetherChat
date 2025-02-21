import React from "react";
function MessageSkeletonBubble({ align, width = "150px" }) {
  return (
    <div
      className={`flex ${align === "left" ? "justify-start" : "justify-end"} mb-4`}
    >
      <div
        className={`rounded-2xl px-4 py-2 ${
          align === "left" ? "bg-gray-200" : "bg-gray-300"
        } animate-pulse`}
        style={{ width }}
      >
        <div className="h-4 rounded bg-gray-400/50 mb-2"></div>
        <div className="flex justify-end">
          <div className="h-3 w-16 rounded bg-gray-400/50"></div>
        </div>
      </div>
    </div>
  );
}
export default MessageSkeletonBubble;