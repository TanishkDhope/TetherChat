import { db } from "../Firebase/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export const useAddUser = () => {
  const userRef = collection(db, "users");

  const addUser = async ({ email, name, profilePicUrl }) => {
    try {
      await addDoc(userRef, {
        email,
        displayName: name,
        timestamp: serverTimestamp(),
        profilePicUrl,
      });
    } catch (error) {
        console.log(error)
    }
  };

  return { addUser };
};
