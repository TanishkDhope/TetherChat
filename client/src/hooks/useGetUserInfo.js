export const useGetUserInfo = () => {
    const authInfo = JSON.parse(localStorage.getItem("auth-info") || "{}");
  
    return {
      email: authInfo.email || null,
      userId: authInfo.userId || null,
      isAuth: authInfo.isAuth || false,
      displayName: authInfo.displayName || "Guest",
      profilePicUrl: authInfo.profilePicUrl || null, // Allow it to be null
    };
  };
  