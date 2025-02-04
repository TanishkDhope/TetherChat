import { collection,query,where,getDocs } from "firebase/firestore";
import { db } from "../Firebase/firebase.js";

export const useGetUserName=()=>{
    const userRef=collection(db, "users");
    const getUsername = async (email)=>{
        const userQuery=query(userRef, where("email", "==", email));
        const user=await getDocs(userQuery);
        return {
            displayName:user.docs[0].data().displayName, 
            profilePicUrl:user.docs[0].data().profilePicUrl
        }
    }
    return {getUsername}
}