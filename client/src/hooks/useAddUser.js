import { apiFetch } from "../lib/api";

export const useAddUser = () => {
  const addUser = async ({ displayName, avatarUrl, name, profilePicUrl } = {}) => {
    try {
      const resolvedDisplayName = displayName || name;
      const resolvedAvatarUrl = avatarUrl || profilePicUrl;

      const body = {};
      if (resolvedDisplayName) body.displayName = resolvedDisplayName;
      if (resolvedAvatarUrl) body.avatarUrl = resolvedAvatarUrl;

      const syncedUser = await apiFetch("/me/sync", {
        method: "POST",
        body,
      });

      return syncedUser;
    } catch (error) {
      console.error("Error syncing user with server:", error);
      throw error;
    }
  };

  return { addUser };
};
