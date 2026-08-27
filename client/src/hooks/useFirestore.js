import { serverTimestamp,getDoc,getDocs,doc,collection, setDoc, query, where, deleteDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
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
    

    
    // ---- GROUPS (durable, keyed by member email) ----

    // Persist a group. `members` is an array of user emails (including the creator).
    const createGroup = async (group) => {
      try {
        const groupRef = doc(db, "groups", group.id);
        await setDoc(groupRef, {
          id: group.id,
          name: group.name,
          members: group.members,
          createdBy: group.createdBy,
          groupPicUrl: group.groupPicUrl || "",
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        console.error("Error creating group:", error);
      }
    };

    // Fetch every group the given email is a member of.
    const getUserGroups = async (email) => {
      try {
        if (!email) return [];
        const groupsQuery = query(
          collection(db, "groups"),
          where("members", "array-contains", email)
        );
        const snapshot = await getDocs(groupsQuery);
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (error) {
        console.error("Error fetching groups:", error);
        return [];
      }
    };

    const deleteGroup = async (groupId) => {
      try {
        await deleteDoc(doc(db, "groups", groupId));
      } catch (error) {
        console.error("Error deleting group:", error);
      }
    };

    // ---- FRIENDS (durable, keyed by email on users/<email> docs) ----

    // A -> B request: add A to B's incoming requests, and track it as sent on A.
    const sendFriendRequest = async (fromEmail, toEmail) => {
      try {
        await updateDoc(doc(db, "users", toEmail), {
          friendRequests: arrayUnion(fromEmail),
        });
        await updateDoc(doc(db, "users", fromEmail), {
          sentRequests: arrayUnion(toEmail),
        });
      } catch (error) {
        console.error("Error sending friend request:", error);
      }
    };

    // B accepts A: both become friends; clear the pending request on both sides.
    const acceptFriendRequest = async (myEmail, requesterEmail) => {
      try {
        await updateDoc(doc(db, "users", myEmail), {
          friends: arrayUnion(requesterEmail),
          friendRequests: arrayRemove(requesterEmail),
        });
        await updateDoc(doc(db, "users", requesterEmail), {
          friends: arrayUnion(myEmail),
          sentRequests: arrayRemove(myEmail),
        });
      } catch (error) {
        console.error("Error accepting friend request:", error);
      }
    };

    const declineFriendRequest = async (myEmail, requesterEmail) => {
      try {
        await updateDoc(doc(db, "users", myEmail), {
          friendRequests: arrayRemove(requesterEmail),
        });
        await updateDoc(doc(db, "users", requesterEmail), {
          sentRequests: arrayRemove(myEmail),
        });
      } catch (error) {
        console.error("Error declining friend request:", error);
      }
    };

    // Read the current user's friend graph (emails only). Missing fields -> [].
    const getFriendData = async (myEmail) => {
      try {
        if (!myEmail) return { friends: [], friendRequests: [], sentRequests: [] };
        const snap = await getDoc(doc(db, "users", myEmail));
        const data = snap.exists() ? snap.data() : {};
        return {
          friends: data.friends || [],
          friendRequests: data.friendRequests || [],
          sentRequests: data.sentRequests || [],
        };
      } catch (error) {
        console.error("Error fetching friend data:", error);
        return { friends: [], friendRequests: [], sentRequests: [] };
      }
    };

    // Resolve a list of emails into profile objects for rendering.
    const getUsersByEmails = async (emails) => {
      try {
        if (!emails || emails.length === 0) return [];
        const snaps = await Promise.all(
          emails.map((e) => getDoc(doc(db, "users", e)))
        );
        return snaps
          .filter((s) => s.exists())
          .map((s) => {
            const d = s.data();
            return {
              email: d.email || s.id,
              displayName: d.displayName,
              profilePicUrl: d.profilePicUrl,
            };
          });
      } catch (error) {
        console.error("Error fetching users by emails:", error);
        return [];
      }
    };

    return {storeMessages,getMessages, getRegisteredUsers, addRegisteredUser, createGroup, getUserGroups, deleteGroup, sendFriendRequest, acceptFriendRequest, declineFriendRequest, getFriendData, getUsersByEmails}

}
