import { serverTimestamp,getDoc,doc,collection, setDoc } from "firebase/firestore";
import { db } from "../Firebase/firebase";

export const useFirestore = () => {
    const storeMessages=async(user, sender, messages)=>{
        try {
            // Correct Firestore Path: messages -> user (doc) -> sender (collection)
            const userDocRef = doc(db, "messages", user); // User as a document
            const senderCollectionRef = collection(userDocRef, sender); // Sender as a collection
            const messageDocRef = doc(senderCollectionRef, "latest"); // Single document for messages
            
            await setDoc(messageDocRef, { messages }, { merge: false });
      
            console.log("Messages stored successfully!");
          } catch (error) {
            console.error("Error storing messages:", error);
          }
    }


    const getMessages = async (user, sender) => {
      try {
        const userDocRef = doc(db, "messages", user);
        const senderCollectionRef = collection(userDocRef, sender); // Reference sender collection
    
        const latestDocRef = doc(senderCollectionRef, "latest"); // Reference "latest" document
    
        const docSnap = await getDoc(latestDocRef);
    
        if (docSnap.exists()) {
          console.log("Fetched Messages:", docSnap.data().messages);
          return docSnap.data().messages; // Return messages array
        } else {
          console.log("No messages found.");
          return [];
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
        return [];
      }

    };

    const getRegisteredUsers = async () => {
      try {
        const registeredUsersRef = doc(db, "registered", "users_list"); // Fetch from "users_list"
        const registeredUsersDocSnap = await getDoc(registeredUsersRef);
    
        if (registeredUsersDocSnap.exists()) {
          const registeredUsers = registeredUsersDocSnap.data().registeredUsers;
          console.log("Registered Users:", registeredUsers);
          return registeredUsers;
        } else {
          console.log("No registered users found.");
          return [];
        }
      } catch (err) {
        console.error("Error fetching registered users:", err);
        return [];
      }
    };

    const addRegisteredUser = async (user) => {
      try {
        const registeredUsersRef = doc(db, "registered", "users_list"); // "users_list" is the document inside "registered"
    
        // Check if the document exists
        const docSnap = await getDoc(registeredUsersRef);
    
        if (docSnap.exists()) {
          // If the document exists, update it by adding the new user to the array
          await updateDoc(registeredUsersRef, {
            registeredUsers: arrayUnion({
              email: user.email,
              displayName: user.name,
              profilePicUrl: user.profilePicUrl || "https://i.pravatar.cc/120",
              timestamp: new Date(),
            }),
          });
        } else {
          // If the document doesn't exist, create it with the first registered user
          await setDoc(registeredUsersRef, {
            registeredUsers: [
              {
                email: user.email,
                displayName: user.name,
                profilePicUrl: user.profilePicUrl || "https://i.pravatar.cc/120",
                timestamp: new Date(),
              },
            ],
          });
        }
    
        console.log("User registered successfully!");
      } catch (error) {
        console.error("Error registering user:", error);
      }
    };
    

    
    return {storeMessages,getMessages, getRegisteredUsers, addRegisteredUser}

}
