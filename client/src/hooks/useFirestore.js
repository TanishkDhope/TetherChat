import { serverTimestamp,getDoc,doc,collection, setDoc } from "firebase/firestore";
import { db } from "../Firebase/firebase";

export const useFirestore = () => {

  function generateId(user1, user2) {
    return [user1, user2].sort().join("_");
  }
  

    const storeMessages=async(user, sender, messages)=>{
        try {
          const key = generateId(user, sender); // Generate consistent chat ID
      
          // Reference a subcollection inside "messages"
          const chatRef = doc(db, "chats", key); 
      
          await setDoc(chatRef, { messages }, { merge: false });
      
          console.log("Messages stored successfully!");
      } catch (error) {
          console.error("Error storing messages:", error);
      }
    }


    const getMessages = async (user, sender) => {
      try {
        const key = generateId(user, sender); // Generate consistent chat ID
        const chatRef = doc(db, "chats", key); // Reference chat document
    
        const chatSnap = await getDoc(chatRef);
    
        if (chatSnap.exists()) {
          const data = chatSnap.data();
          return data.messages || []; // Return messages array
        } else {
          console.log("No messages found.");
          return [];
        }
      } catch (error) {
        console.error("Error fetching messages:", error);
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
