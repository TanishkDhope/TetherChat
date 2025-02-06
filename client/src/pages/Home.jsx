import React, { useEffect, useState, useMemo, useContext } from "react";
import { auth } from "../Firebase/firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { useGetUserInfo } from "../hooks/useGetUserInfo";
import { connect, io } from "socket.io-client";
import { nanoid } from "nanoid";
import { socketContext } from "../contexts/socketContext";
import { GetRoomInfo } from "../hooks/useGetRoomInfo";
import { Plus, UserPlus, X, Users, Check, Trash2 } from "lucide-react";
import NewChatButton from "../components/NewChatButton";

function Home() {
  const navigate = useNavigate();
  const { isAuth, displayName, profilePicUrl } = useGetUserInfo(); // Assume `user` contains displayName and profile picture
  const [onlineUsers, setOnlineUsers] = useState([]);
  const { socket, setSocket } = useContext(socketContext);
  setSocket(useMemo(() => io("http://localhost:5000"), []));
  const [joinInfo, setJoinInfo] = useState({});
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [chats, setChats]=useState([])
  const [showOnlineUsers, setShowOnlineUsers] = useState(false);

  useEffect(() => {
    if (!isAuth) {
      navigate("/");
    }
  }, [isAuth, navigate]);

  useEffect(() => {
    if (displayName && socket) {
      socket.emit("join", { displayName, profilePicUrl });

      socket.on("onlineUsers", (users) => {
        setOnlineUsers(users);
      });

      socket.on("requestJoin", ({ from, roomId }) => {
        setJoinInfo({ from, roomId });
        localStorage.setItem(from, roomId);
        socket.emit("joinRoom", roomId);
        setIsVisible(true);
      });

      socket.on("groupCreated", (group) => {
        setGroups((prev) => [...prev, group]);
        console.log(group)
      });

      socket.on("userCreated", (chat) => {
        setChats((prev) => [...prev, chat]);
      });
    }
  }, [displayName, socket]);

  const handleJoinRoom = (user) => {
    const ExistRoom = GetRoomInfo(user.name);
    console.log(ExistRoom);
    if (ExistRoom.roomId) {
      socket.emit("joinRoom", ExistRoom.roomId);
      setJoinInfo({ from: displayName, roomId: ExistRoom.roomId });
      socket.emit("requestJoin", {
        from: displayName,
        to: user.id,
        roomId: ExistRoom.roomId,
      });
      navigate(`/chat/${ExistRoom.roomId}`);
      return;
    }
    const roomId = nanoid();
    socket.emit("joinRoom", roomId);
    console.log("Hello");
    setJoinInfo({ from: displayName, roomId });
    navigate(`/chat/${roomId}`);
    socket.emit("requestJoin", { from: displayName, to: user.id, roomId });
  };

  const handleSignOut = async () => {
    try {
      socket.disconnect();
      await signOut(auth);
      localStorage.clear();
      navigate("/");
    } catch (err) {
      console.log(err);
    }
  };

  //REQUEST MODAL LOGIC
  const [isVisible, setIsVisible] = useState(false);

  const handleAccept = () => {
    setIsVisible(false);
    navigate(`/chat/${joinInfo.roomId}`);
  };

  const handleDecline = () => {
    setIsVisible(false);
  };

  //GROUP LOGIC
  const handleCreateGroup = () => {
    if (groupName.trim() === "") {
      alert("Please enter a group name.");
      return;
    }

    if (selectedUsers.length === 0) {
      alert("Please select at least one user to add to the group.");
      return;
    }

    // Emit an event to the server to create the group
    socket.emit("createGroup", { groupName, users: selectedUsers });
    console.log(onlineUsers)

    // Close the modal and reset the state
    setIsGroupModalOpen(false);
    setGroupName("");
    setSelectedUsers([]);
  };

  const handleDeleteGroup=(groupId)=>{
    socket.emit("deleteGroup", groupId);
    setGroups(groups.filter(group => group.id !== groupId));

  }

  const handleUserSelection = (userId) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreateChat = () => {
    if (selectedUsers.length === 0) {
      alert("Please select at least one user to add to the group.");
      return;
    }

    console.log(selectedUsers)

    // socket.emit("createUser", { users: selectedUsers });

    setIsUserModalOpen(false);
    setSelectedUsers([]);

  }

 

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Header with Display Name and Icon */}
<header className="bg-white shadow-lg p-4 flex justify-between items-center">
 <div className="flex items-center space-x-4">
   <img
     src={profilePicUrl || "https://i.pravatar.cc/120"}
     alt="Profile"
     className="w-15 h-15 rounded-full"
   />
   <h1 className="text-xl font-semibold text-gray-800">{displayName}</h1>
 </div>
 <div className="flex items-center space-x-4">
   <div className="relative">
     <button 
       onClick={() => setShowOnlineUsers(!showOnlineUsers)}
       className="text-gray-600 hover:bg-gray-100 p-2 rounded-full transition"
     >
       <Users className="w-6 h-6" />
       {onlineUsers.length > 0 && (
         <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
           {onlineUsers.length}
         </span>
       )}
     </button>

     {showOnlineUsers && (
       <div className="z-50 absolute right-0 top-full mt-2 w-64 bg-white shadow-lg rounded-lg border">
         <h3 className="text-sm font-semibold text-gray-700 p-3 border-b">
           Online Users ({onlineUsers.length})
         </h3>
         <div className="max-h-64 overflow-y-auto">
           {onlineUsers.map((user) => (
             <div 
               key={user.id}
               onClick={() => handleJoinRoom(user)}
               className="flex items-center p-3 hover:bg-gray-100 cursor-pointer transition"
             >
               <img 
                 src={user.profilePicUrl} 
                 className="w-10 h-10 rounded-full mr-3" 
               />
               <span className="text-gray-700">{user.name}</span>
             </div>
           ))}
         </div>
       </div>
     )}
   </div>
   <button
     onClick={handleSignOut}
     className="bg-red-500 text-white py-2 px-4 rounded-lg font-semibold hover:bg-red-600 transition duration-300"
   >
     Sign Out
   </button>
 </div>
</header>


<main className="h-100vh">
 {groups.length === 0 && onlineUsers.length===0? (
   <div className="text-center bg-white p-10 rounded-2xl shadow-lg">
     <h2 className="text-3xl font-bold text-gray-800 mb-4">
       Welcome to the Chat App!
     </h2>
     <p className="text-gray-600 text-lg max-w-md mx-auto">
       Start connecting with friends by creating your first group.
     </p>
     <button 
       onClick={() => setIsGroupModalOpen(true)}
       className="mt-6 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
     >
       Create First Group
     </button>
   </div>
 ) : (
   <div className="p-4 bg-gray-50 w-full">
     <h3 className="text-3xl font-bold text-gray-800 mb-6 border-b-2 border-blue-200 pb-3">
       Your Groups and Chats
     </h3>
     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
     {onlineUsers.map((user) => (
         <div
           key={user.id}
           className="cursor-pointer bg-white rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden relative group transform hover:-translate-y-2"
           onClick={()=>handleJoinRoom(user)}
         >
           <div className="p-6">
             <div className="flex justify-between items-start mb-4">
               <div>
                 <h4 className="text-2xl font-bold text-gray-800 mb-2">
                   {user.name}
                 </h4>
                 <div className="flex space-x-2">
                   <span className="bg-green-100 text-green-800 text-xs px-3 py-1 rounded-full">
                      online
                   </span>
                   
                 </div>
               </div>
             </div>

             <div className="bg-gray-100 p-4 rounded-xl mb-4">
               <div className="flex items-center space-x-3">
                 <img
                   src="https://i.pravatar.cc/150"
                   className="w-10 h-10 rounded-full border-2 border-white"
                 />
                 <div className="flex-grow">
                   <p className="text-sm font-semibold text-gray-800">
                     {user.name}
                   </p>
                   <p className="text-xs text-gray-600 truncate">
                     Meeting scheduled for tomorrow at 10 AM
                   </p>
                 </div>
                 <span className="text-xs text-gray-500">
                   2m ago
                 </span>
               </div>
             </div>
           </div>
         </div>
       ))}
       {groups.map((group) => (
         <div
           key={group.id}
           className="cursor-pointer bg-white rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden relative group transform hover:-translate-y-2"
         >
           <div className="p-6">
             <div className="flex justify-between items-start mb-4">
               <div>
                 <h4 className="text-2xl font-bold text-gray-800 mb-2">
                   {group.name}
                 </h4>
                 <div className="flex space-x-2">
                   <span className="bg-green-100 text-green-800 text-xs px-3 py-1 rounded-full">
                     {group.onlineUsers} online
                   </span>
                   <span className="bg-blue-100 text-blue-800 text-xs px-3 py-1 rounded-full">
                     {group.users.length} total
                   </span>
                 </div>
               </div>
               <button
                 onClick={() => handleDeleteGroup(group.id)}
                 className="absolute top-4 right-4 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-red-50 rounded-full p-2"
               >
                 <Trash2 className="w-6 h-6" />
               </button>
             </div>
             
             <div className="bg-gray-100 p-4 rounded-xl mb-4">
               <div className="flex items-center space-x-3">
                 <img
                   src="https://i.pravatar.cc/150"
                   className="w-10 h-10 rounded-full border-2 border-white"
                 />
                 <div className="flex-grow">
                   <p className="text-sm font-semibold text-gray-800">
                     John Doe
                   </p>
                   <p className="text-xs text-gray-600 truncate">
                     Meeting scheduled for tomorrow at 10 AM
                   </p>
                 </div>
                 <span className="text-xs text-gray-500">
                   2m ago
                 </span>
               </div>
             </div>
           </div>
         </div>
       ))}
       
     </div>
   </div>
 )}
</main>
 {/* Floating New Chat Button */}
 <button
        onClick={() => setIsUserModalOpen(true)}
        className="fixed bottom-25 right-8 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition duration-300"
      >
        New Chat
      </button>

      {/*USER MODAL*/}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md transform transition-all">
            <div className="bg-blue-600 text-white p-6 rounded-t-2xl">
              <h2 className="text-2xl font-bold flex items-center">
                <Users className="mr-3 w-8 h-8" />
                Create New Group
              </h2>
              <p className="text-sm text-blue-100 mt-2">
                Add members and give your group a name
              </p>
            </div>

            <div className="p-6">
        

              <h3 className="text-lg font-semibold mb-3 text-gray-700">
                Select User to Chat With
              </h3>

              <div className="max-h-64 overflow-y-auto space-y-2 mb-4 scrollbar-thin scrollbar-thumb-blue-300 scrollbar-track-blue-100">
                {onlineUsers.map((user) => (
                  <div
                    key={user.id}
                    className={`flex items-center p-2 rounded-lg cursor-pointer transition 
                ${
                  selectedUsers.includes(user.id)
                    ? "bg-blue-100"
                    : "hover:bg-gray-100"
                }`}
                    onClick={() => handleUserSelection(user.id)}
                  >
                    <img
                      src={user.profilePicUrl}
                      alt={user.name}
                      className="w-10 h-10 rounded-full mr-3 border-2 border-white shadow-sm"
                    />
                    <span className="text-gray-700 font-medium flex-grow">
                      {user.name}
                    </span>
                    {selectedUsers.includes(user.id) && (
                      <span className="text-blue-600">
                        <Check className="w-5 h-5" />
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateChat}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md transition"
                >
                  Create Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

     
      {/*Create Group Button*/}
      <button
        onClick={() => setIsGroupModalOpen(true)}
        className="fixed bottom-8 right-8 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition duration-300"
      >
        + Create Group
      </button>

      
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md transform transition-all">
            <div className="bg-blue-600 text-white p-6 rounded-t-2xl">
              <h2 className="text-2xl font-bold flex items-center">
                <Users className="mr-3 w-8 h-8" />
                Create New Group
              </h2>
              <p className="text-sm text-blue-100 mt-2">
                Add members and give your group a name
              </p>
            </div>

            <div className="p-6">
              <input
                type="text"
                placeholder="Group Name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
              />

              <h3 className="text-lg font-semibold mb-3 text-gray-700">
                Select Group Members
              </h3>

              <div className="max-h-64 overflow-y-auto space-y-2 mb-4 scrollbar-thin scrollbar-thumb-blue-300 scrollbar-track-blue-100">
                {onlineUsers.map((user) => (
                  <div
                    key={user.id}
                    className={`flex items-center p-2 rounded-lg cursor-pointer transition 
                ${
                  selectedUsers.includes(user.id)
                    ? "bg-blue-100"
                    : "hover:bg-gray-100"
                }`}
                    onClick={() => handleUserSelection(user.id)}
                  >
                    <img
                      src={user.profilePicUrl}
                      alt={user.name}
                      className="w-10 h-10 rounded-full mr-3 border-2 border-white shadow-sm"
                    />
                    <span className="text-gray-700 font-medium flex-grow">
                      {user.name}
                    </span>
                    {selectedUsers.includes(user.id) && (
                      <span className="text-blue-600">
                        <Check className="w-5 h-5" />
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => setIsGroupModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGroup}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md transition"
                >
                  Create Group
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

     
      <div
        className={`fixed bottom-4 right-4 transform transition-all duration-500 ease-in-out ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="bg-white rounded-lg shadow-lg p-4 flex items-center gap-4 border border-gray-200 max-w-md">
          <div className="bg-blue-100 p-2 rounded-full">
            <UserPlus className="w-6 h-6 text-blue-600" />
          </div>

          <div className="flex-1">
            <h3 className="font-medium text-gray-900">Room Join Request</h3>
            <p className="text-sm text-gray-600">
              {joinInfo.from} wants you to join room{" "}
              {joinInfo.roomId ? joinInfo.roomId : "No Room Id"}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAccept}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
            >
              Accept
            </button>
            <button
              onClick={handleDecline}
              className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300 transition-colors"
            >
              Decline
            </button>
          </div>

          <button
            onClick={handleDecline}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Home;
