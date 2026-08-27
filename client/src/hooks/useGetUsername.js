import { collection,query,where,getDocs } from "firebase/firestore";
import { db } from "../Firebase/firebase.js";

export const useGetUserName=()=>{
    const userRef=collection(db, "users");
    const getUsername = async (email)=>{
        const userQuery=query(userRef, where("email", "==", email));
        const user=await getDocs(userQuery);
        // No matching user doc (e.g. a Google-only account, or a user that was
        // never written to the "users" collection) — don't index into an empty
        // result, just return nulls and let the caller fall back.
        if (user.empty) {
            return { displayName: null, profilePicUrl: null };
        }
        const data = user.docs[0].data();
        return {
            displayName: data.displayName,
            profilePicUrl: data.profilePicUrl
        }
    }
    return {getUsername}
}