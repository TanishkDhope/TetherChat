import { apiFetch } from "../lib/api";

export const useApi = () => {
  const getMessages = async (conversationId, before) => {
    const query = before ? `?limit=50&before=${encodeURIComponent(before)}` : "?limit=50";
    return await apiFetch(`/conversations/${conversationId}/messages${query}`);
  };

  const getConversations = async () => {
    return await apiFetch("/me/conversations");
  };

  const getConversation = async (conversationId) => {
    return await apiFetch(`/conversations/${conversationId}`);
  };

  const createGroupConversation = async ({ name, memberIds = [], avatarUrl = null }) => {
    return await apiFetch("/conversations", {
      method: "POST",
      body: {
        kind: "group",
        name,
        memberIds,
        avatarUrl,
      },
    });
  };

  const deleteConversation = async (conversationId) => {
    return await apiFetch(`/conversations/${conversationId}`, {
      method: "DELETE",
    });
  };

  const getOrCreateDm = async (otherUserId) => {
    return await apiFetch("/conversations/dm", {
      method: "POST",
      body: { otherUserId },
    });
  };

  const sendFriendRequest = async (toUserId) => {
    return await apiFetch("/friends/requests", {
      method: "POST",
      body: { toUserId },
    });
  };

  const acceptFriendRequest = async (otherId) => {
    return await apiFetch(`/friends/requests/${otherId}/accept`, {
      method: "POST",
    });
  };

  const declineFriendRequest = async (otherId) => {
    return await apiFetch(`/friends/requests/${otherId}/decline`, {
      method: "POST",
    });
  };

  const getFriends = async () => {
    return await apiFetch("/me/friends");
  };

  const searchUsers = async (q) => {
    return await apiFetch(`/users/search?q=${encodeURIComponent(q || "")}`);
  };

  return {
    getMessages,
    getConversations,
    getConversation,
    createGroupConversation,
    deleteConversation,
    getOrCreateDm,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    getFriends,
    searchUsers,
  };
};
