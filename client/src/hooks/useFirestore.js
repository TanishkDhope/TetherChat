import { getDoc,doc,collection, setDoc } from "firebase/firestore";
import { db } from "../Firebase/firebase";

export const useFirestore = () => {
    const storeMessages=async(user, sender, messages)=>{
        try {
            // Correct Firestore Path: messages -> user (doc) -> sender (collection)
            const userDocRef = doc(db, "messages", user); // User as a document
            const senderCollectionRef = collection(userDocRef, sender); // Sender as a collection
            const messageDocRef = doc(senderCollectionRef, "latest"); // Single document for messages
            const lastMessage=messages[messages.length-1]
            // const lastMessageRef=doc(senderCollectionRef, "lastMessage") //Store Last Message
            
      
            await setDoc(messageDocRef, { messages }, { merge: false });
            // await setDoc(lastMessageRef, lastMessage, { merge: false });
      
            console.log("Messages stored successfully!");
          } catch (error) {
            console.error("Error storing messages:", error);
          }
    }

    const getMessages = async (user, sender) => {
        try{
            const userDocRef = doc(db, "messages", user);
            const senderCollectionRef = doc(userDocRef, sender, "latest"); // Fetch "latest" document
      
            const docSnap = await getDoc(senderCollectionRef);
      
            if (docSnap.exists()) {
              return docSnap.data().messages; // Return messages array
            } else {
              console.log("No messages found.");
              return [];
            }
        }catch(err){
            console.log(err)
        }
    }

    
    return {storeMessages,getMessages}

}
