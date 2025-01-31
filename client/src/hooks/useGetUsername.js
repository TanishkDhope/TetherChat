import { collection,query,where,getDocs } from "firebase/firestore";
import { db } from "../Firebase/firebase.js";

export const useGetUserName=()=>{
    const userRef=collection(db, "users");
    const getUsername = async (email)=>{
        const userQuery=query(userRef, where("email", "==", email));
        const user=await getDocs(userQuery);
        return user.docs[0].data().displayName
    }
    return {getUsername}
}