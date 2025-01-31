import { db } from "../Firebase/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export const useAddUser = () => {
  const userRef = collection(db, "users");

  const addUser = async ({ email, name }) => {
    try {
      await addDoc(userRef, {
        email,
        displayName: name,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
        console.log(error)
    }
  };

  return { addUser };
};
