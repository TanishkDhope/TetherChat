import { useContext, useState, useEffect } from "react";
import { AuthContext } from "../contexts/AuthContext";
import { auth } from "../Firebase/firebase";

export const useGetUserInfo = () => {
  const context = useContext(AuthContext);
  if (context) {
    return context;
  }

  // Fallback direct subscription if rendered outside AuthProvider
  const [user, setUser] = useState(auth.currentUser);
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(setUser);
    return unsub;
  }, []);

  return {
    user,
    uid: user?.uid || null,
    userId: user?.uid || null,
    email: user?.email || null,
    displayName: user?.displayName || "Guest",
    profilePicUrl: user?.photoURL || null,
    isAuth: !!user,
  };
};