import { apiFetch } from "../lib/api";

export const useGetUserName = () => {
  const getUsername = async () => {
    try {
      const me = await apiFetch("/me");
      return {
        displayName: me.displayName,
        profilePicUrl: me.avatarUrl,
        user: me,
      };
    } catch (error) {
      console.error("Error fetching username from /me:", error);
      return { displayName: null, profilePicUrl: null, user: null };
    }
  };

  return { getUsername };
};