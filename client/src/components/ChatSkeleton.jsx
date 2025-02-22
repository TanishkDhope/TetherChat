import React from "react";
import MessageSkeletonBubble from "./MessageSkeletonBubble";
export function ChatSkeleton() {
  return (
    <div className="max-w-md sm:max-w-full mx-auto mt-3 px-3 space-y-4">
      <MessageSkeletonBubble align="right" width="120px" />
      <MessageSkeletonBubble align="left" width="100px" />
      <MessageSkeletonBubble align="right" width="180px" />
      <MessageSkeletonBubble align="left" width="140px" />
      <MessageSkeletonBubble align="right" width="130px" />
      <MessageSkeletonBubble align="left" width="180px" />
      <MessageSkeletonBubble align="right" width="130px" />
    </div>
  );
}