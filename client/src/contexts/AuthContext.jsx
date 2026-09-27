import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../Firebase/firebase";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signOutUser = async () => {
    await firebaseSignOut(auth);
  };

  const value = {
    user,
    uid: user?.uid || null,
    userId: user?.uid || null,
    email: user?.email || null,
    displayName: user?.displayName || "Guest",
    profilePicUrl: user?.photoURL || null,
    isAuth: !!user,
    loading,
    signOutUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
