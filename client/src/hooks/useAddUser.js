import { Profiler } from "react";
import { db } from "../Firebase/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export const useAddUser = () => {
  const addUser = async ({ email, name, profilePicUrl }) => {
    try {
      const userDocRef = doc(db, "users", email); // Use email as document ID

      await setDoc(userDocRef, {
        email,
        displayName: name,
        profilePicUrl: profilePicUrl || "https://t3.ftcdn.net/jpg/02/43/30/32/240_F_243303238_bimcrcQFzIPFlQQEWtU54tcPG5SnmsZD.jpg",
        timestamp: serverTimestamp(),
      }, { merge: true }); // Merge prevents overwriting existing data

    } catch (error) {
      console.error("Error adding user:", error);
    }
  };

  return { addUser };
};
