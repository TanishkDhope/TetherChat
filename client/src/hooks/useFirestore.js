import { serverTimestamp,getDoc,getDocs,doc,collection, setDoc } from "firebase/firestore";
import { db } from "../Firebase/firebase";

export const useFirestore = () => {

  function generateId(user1, user2) {
    return [user1, user2].sort().join("_");
  }
  

    const storeMessages=async(user, sender, messages)=>{
      //   try {
      //     const key = generateId(user, sender); // Generate consistent chat ID
      
      //     // Reference a subcollection inside "messages"
      //     const chatRef = doc(db, "chats", key); 
      
      //     await setDoc(chatRef, { messages }, { merge: false });
      
      //     console.log("Messages stored successfully!");
      // } catch (error) {
      //     console.error("Error storing messages:", error);
      // }
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
          console.log("No messages found. key: ", key);
          return [];
        }
      } catch (error) {
        console.error("Error fetching messages:", error);
        return [];
      }

    };

    const getRegisteredUsers = async () => {
      try {
        const usersCollection = collection(db, "users"); // Reference to the "users" collection
        const usersSnapshot = await getDocs(usersCollection); // Fetch all documents
        const usersList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); // Map to array
    
        return usersList;
      } catch (error) {
        console.error("Error fetching users:", error);
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
              profilePicUrl: user.profilePicUrl || "https://t3.ftcdn.net/jpg/02/43/30/32/240_F_243303238_bimcrcQFzIPFlQQEWtU54tcPG5SnmsZD.jpg",
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
                profilePicUrl: user.profilePicUrl || "https://t3.ftcdn.net/jpg/02/43/30/32/240_F_243303238_bimcrcQFzIPFlQQEWtU54tcPG5SnmsZD.jpg",
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
