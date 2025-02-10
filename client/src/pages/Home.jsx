import React, { useEffect, useState, useMemo, useContext, useRef } from "react";
import { auth } from "../Firebase/firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { useGetUserInfo } from "../hooks/useGetUserInfo";
import { io } from "socket.io-client";
import { nanoid } from "nanoid";
import { socketContext } from "../contexts/socketContext";
import { GetRoomInfo } from "../hooks/useGetRoomInfo";
import {
  UserPlus,
  X,
  Users,
  Check,
  LogOut,
  Trash2,
  MessageSquare,
  Heart,
  Video,
  Phone,
  Mic,
  SendHorizontal,
  Smile,
  Moon,
  Sun,
  Palette,
  Globe,
  Send,
  Bell,
  Lock,
} from "lucide-react";
import { AiOutlineUser } from "react-icons/ai";
import { RxExit } from "react-icons/rx";
import { TbSettings } from "react-icons/tb";
import { CiCreditCard1 } from "react-icons/ci";
import { BiSupport } from "react-icons/bi";
import styled from "styled-components";
import { Sidebar } from "../components/Sidebar";
import { MdOutlineMoreVert } from "react-icons/md";
import { useFirestore } from "../hooks/useFirestore";
import { use } from "react";

function Home() {
  const navigate = useNavigate();
  const [registeredUsers,setRegisteredUsers] = useState([])
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
  const [showOnlineUsers, setShowOnlineUsers] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const profileRef = useRef(null);
  const userRef = useRef(null);
  const menuRef = useRef(null)
  const [isOnline, setIsOnline] = useState("online");
  const [statusMessage, setStatusMessage] = useState("");
  const [showMenu, setShowMenu] = useState(false)
  const [theme, setTheme] = useState("light");
  const {getRegisteredUsers }=useFirestore()
  const quickStats = [
    { icon: <Users />, label: "Online Friends", value: "12" },
    { icon: <MessageSquare />, label: "Active Chats", value: "5" },
    { icon: <Heart />, label: "Favorite Groups", value: "3" },
  ];

  const [notifications, setNotifications] = useState(true);
  const [privacyMode, setPrivacyMode] = useState(false);

  const toggles = [
    {
      icon: <Bell />,
      label: 'Notifications',
      state: notifications,
      toggle: () => setNotifications(!notifications)
    },
    {
      icon: <Lock />,
      label: 'Privacy Mode',
      state: privacyMode,
      toggle: () => setPrivacyMode(!privacyMode)
    }
  ];


  const handleStatusUpdate = () => {
    socket.emit("join", {
      displayName,
      profilePicUrl,
      status: statusMessage,
      isOnline,
    });
    console.log(statusMessage);

    setStatusMessage("");
  };

  const handleOnline = () => {
    setIsOnline((prevState) => {
      const newStatus = prevState === "online" ? "offline" : "online";

      // Emit the updated status AFTER setting state
      socket.emit("join", {
        displayName,
        profilePicUrl,
        status: statusMessage,
        isOnline: newStatus,
      });
      localStorage.setItem("isOnline", newStatus);

      return newStatus; // Update state with the new value
    });
  };

  useEffect(() => {
    const getUsers = async () => {
      const localUsers = localStorage.getItem("registeredUsers");
      if (!localUsers) {
        const registeredUsers = await getRegisteredUsers();
        setRegisteredUsers(registeredUsers);
        localStorage.setItem("registeredUsers", JSON.stringify(registeredUsers));
        console.log("Registered Users Loaded");
      }
      else {
        setRegisteredUsers(JSON.parse(localUsers));
        console.log("Local Users Loaded");
      }
      
    }
    getUsers();

    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfile(false);
      }
      if (userRef.current && !userRef.current.contains(event.target)) {
        setShowOnlineUsers(false);
      }
      if(menuRef.current && !menuRef.current.contains(event.target)){
        setShowMenu(false)
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!isAuth) {
      navigate("/");
    }
  }, [isAuth, navigate]);

  useEffect(() => {
    if (displayName && socket) {



      setIsOnline((prevState) => {
        const newState = localStorage.getItem("isOnline") || "online";

        socket.emit("join", {
          displayName,
          profilePicUrl,
          status: statusMessage,
          isOnline: newState,
        });

        return newState; // Update state with the new value
      });

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
      });
    }
  }, [displayName, socket]);

  const handleJoinRoom = (user) => {
    const ExistRoom = GetRoomInfo(user.name);
    let roomId;
    if (ExistRoom.roomId) {
      roomId = ExistRoom.roomId;
    } else {
      roomId = nanoid();
    }
    socket.emit("joinRoom", roomId);
    localStorage.setItem(user.name, roomId);
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
    console.log(onlineUsers);

    // Close the modal and reset the state
    setIsGroupModalOpen(false);
    setGroupName("");
    setSelectedUsers([]);
  };

  const handleDeleteGroup = (groupId) => {
    socket.emit("deleteGroup", groupId);
    setGroups(groups.filter((group) => group.id !== groupId));
  };

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

    console.log(selectedUsers);

    setIsUserModalOpen(false);
    setSelectedUsers([]);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Header with Display Name and Icon */}
      <header className="shadow-3xl  bg- p-4 flex justify-between items-center">
        {/* Profile Section */}
        <div className=" relative flex items-center space-x-4 header-item">
          <img
            src={profilePicUrl || "https://i.pravatar.cc/120"}
            alt="Profile"
            className="cursor-pointer w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 border-gray-200 shadow-md"
            onClick={() => setShowProfile(!showProfile)} // Toggle profile dropdown
          />
          {showProfile && (
            <div
              ref={profileRef}
              className="hidden sm:block  p-3 z-50 shadow-2xl absolute left-[-6px] top-13 mt-2 w-56 sm:w-64 bg-gray-50 shadow-xl rounded-2xl overflow-hidden transform scale-95 transition-all duration-200"
            >
              <div className="p-4 gap-2 justify-start flex flex-row items-center">
                <img
                  src={profilePicUrl}
                  alt="Profile"
                  className="w-12 h-12 sm:w-13 sm:h-13 rounded-full border border-gray-300 shadow-sm"
                />
                <div>
                  <h3 className="text-md sm:text-lg font-bold text-gray-800 ">
                    {displayName}
                  </h3>
                  <h5 className="text-xs sm:text-sm text-gray-400 ">
                    example@gmail.com
                  </h5>
                </div>
              </div>

              <div className="border-t border-gray-300">
                <button className="mt-1 cursor-pointer gap-4 flex justify-start w-full rounded-xl px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600  flex items-center justify-center transition duration-300">
                  <AiOutlineUser /> View Profile
                </button>
                <button className="cursor-pointer gap-4 flex justify-start w-full rounded-xl px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600  flex items-center justify-center transition duration-300">
                  <TbSettings /> Settings
                </button>
                <div className="mt-1 border-t border-gray-300">
                  <button className="mt-1 cursor-pointer gap-4 flex justify-start w-full rounded-xl px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600  flex items-center justify-center transition duration-300">
                    <CiCreditCard1 /> Subscription
                  </button>
                  <button className="cursor-pointer gap-4 flex justify-start w-full rounded-xl px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600  flex items-center justify-center transition duration-300">
                    <BiSupport /> Support
                  </button>
                </div>
                <div className="mt-1 border-t border-gray-300">
                  <button
                    className=" mt-1 cursor-pointer gap-4 flex justify-start w-full rounded-xl px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center justify-center transition duration-300"
                    onClick={handleSignOut}
                  >
                    <RxExit /> Sign Out
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Display Name */}
          <h1 className="text-md sm:text-3xl font-bold text-black ">
            {displayName}
          </h1>
        </div>

        {/* Online Users and Sign Out Button */}
        <div className="flex items-center space-x-4">
          <div className="hidden sm:block relative">
            <input
              placeholder="Search..."
              className="input shadow-lg focus:border-2 border-gray-300 px-5 py-3 rounded-xl w-80 transition-all focus:w-94 outline-none"
              name="search"
              type="search"
            />
            <svg
              className="size-6 absolute top-3 right-3 text-gray-500"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <StyledWrapper className="hidden sm:block">
            <label className="switch">
              <input type="checkbox" />
              <span className="slider" />
            </label>
          </StyledWrapper>
          <button className="cursor-pointer hidden sm:block text-gray-600 hover:bg-gray-200 p-2 rounded-full transition duration-300">
            <TbSettings className="text-black w-5 h-5 sm:w-7 sm:h-7" />
          </button>
          {/* Online Users Button */}
          <div ref={userRef} className="relative header-item">
            <button
              onClick={() => setShowOnlineUsers(!showOnlineUsers)}
              className="cursor-pointer text-gray-600 hover:bg-gray-200 p-2 rounded-full transition duration-300"
            >
              <Users className="text-black w-5 h-5 sm:w-6 sm:h-6" />
              {onlineUsers.length > 0 && (
                <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full px-1 py-0">
                  {onlineUsers.length}
                </span>
              )}
            </button>

            {/* Online Users Dropdown */}
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
                      className="flex items-center p-3 hover:bg-gray-100 cursor-pointer transition duration-300"
                    >
                      <img
                        src={user.profilePicUrl}
                        className="w-8 h-8 sm:w-10 sm:h-10 rounded-full mr-3"
                      />
                      <span className="text-sm sm:text-base text-gray-700">
                        {user.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sign Out Button */}
          <button
            onClick={handleSignOut}
            className=" hidden sm:block bg-red-500 text-white cursor-pointer py-2 px-2 sm:px-4 rounded-lg font-semibold hover:bg-red-600 transition duration-300 text-xs sm:text-base"
          >
            Sign Out
          </button>
          <button onClick={()=>setShowMenu(!showMenu)} className=" sm:hidden cursor-pointer text-2xl text-black font-bold">
            <MdOutlineMoreVert/>
          </button>
         
        </div>
      </header>
      {/* Menu With Options */}
      { showMenu && (
      <div ref={menuRef} className="p-3 z-50 shadow-2xl absolute right-3 top-13 mt-2 w-64 bg-gray-50 rounded-2xl overflow-hidden transform scale-95 transition-all duration-200">
        <div className="border-gray-300 py-2">
          {toggles.map((toggle, index) => (
            <div 
              key={index} 
              className="flex justify-between items-center px-4 py-3 hover:bg-blue-50 transition"
            >
              <div className="flex items-center gap-3">
                {toggle.icon}
                <span className="text-sm text-gray-700">{toggle.label}</span>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={toggle.state}
                  onChange={toggle.toggle}
                  className="sr-only peer"
                />
                <div className="relative w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-300 px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Globe size={18} />
              <span className="text-sm text-gray-700">Online Status</span>
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={isOnline=="online"?true:false}
                onChange={(e) => handleOnline()}
                className="sr-only peer"
              />
              <div className="relative w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        <div className="border-t border-gray-300">
          <button 
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition"
          >
            <div className="flex items-center gap-3">
              {theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}
              <span className="text-sm text-gray-700">
                {theme === 'light' ? 'Light Mode' : 'Dark Mode'}
              </span>
            </div>
          </button>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-between px-4 py-3 text-red-600 hover:bg-red-50 transition"
          >
            <div className="flex items-center gap-3">
              <LogOut size={18} />
              <span className="text-sm">Sign Out</span>
            </div>
          </button>
        </div>
      </div>)}

      <main
        style={{
          minHeight: "100vh",
        }}
        className=""
      >
        <div className="flex flex-row ">
          <Sidebar
            onlineUsers={onlineUsers}
            groups={groups}
            handleJoinRoom={handleJoinRoom}
            registeredUsers={registeredUsers}
          />

          <div
            style={{
              minHeight: "100vh",
              flexDirection: "column",
              minWidth: "80%",
            }}
            className="sm:block hidden text-center flex justify-center items-center bg-white p-5 shadow-lg"
          >
            <div className="mt-0 w-full">
              <div className="mt-30">
                <h2 className="text-3xl font-bold text-gray-800 mb-4">
                  Welcome to the Chat App!
                </h2>
                <p className="xt-gray-600 text-lg max-w-md mx-auto">
                  Start connecting with friends by creating your first group.
                </p>
                <button
                  onClick={() => setIsGroupModalOpen(true)}
                  className="mt-4 mb-15 overflow-hidden relative w-38 p-2 h-12 bg-black text-white border-none rounded-md text-xl font-bold cursor-pointer  group"
                >
                  Create Group
                  <span className="absolute w-36 h-32 -top-8 -left-2 bg-white rotate-12 transform scale-x-0 group-hover:scale-x-100 transition-transform group-hover:duration-500 duration-1000 origin-left" />
                  <span className="absolute w-36 h-32 -top-8 -left-2 bg-indigo-400 rotate-12 transform scale-x-0 group-hover:scale-x-100 transition-transform group-hover:duration-700 duration-700 origin-left" />
                  <span className="absolute w-36 h-32 -top-8 -left-2 bg-indigo-600 rotate-12 transform scale-x-0 group-hover:scale-x-50 transition-transform group-hover:duration-1000 duration-500 origin-left" />
                  <span className="ml-2 group-hover:opacity-100 group-hover:duration-1000 duration-100 opacity-0 absolute top-2.5 left-6 z-10">
                    Connect!
                  </span>
                </button>
                {/* New Sections Container */}
                <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto px-4 mb-8">
                  {/* Personal Status Section */}
                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      Your Status
                    </h3>
                    <div className="space-y-4">
                      {/* Status Toggle */}
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Availability</span>
                        <button
                          onClick={() => handleOnline()}
                          className={`px-3 py-1 rounded-full flex items-center gap-2 cursor-pointer ${
                            isOnline === "online"
                              ? "bg-green-100 text-green-600"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {isOnline === "online" ? (
                            <Sun size={16} />
                          ) : (
                            <Moon size={16} />
                          )}
                          {isOnline.charAt(0).toUpperCase() + isOnline.slice(1)}
                        </button>
                      </div>
                      {/* Status Message Input */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="What's on your mind?"
                          value={statusMessage}
                          onChange={(e) => setStatusMessage(e.target.value)}
                          className="w-full p-2 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
                        />
                        <button
                          onClick={handleStatusUpdate}
                          className="cursor-pointer mr-3 absolute right-2 top-3 text-gray-400 hover:text-gray-600"
                        >
                          <Send size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* Quick Settings Access */}
                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      Quick Settings
                    </h3>
                    <div className="space-y-4">
                      {/* Theme Toggle */}
                      <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                            <Palette size={20} />
                          </div>
                          <span className="text-gray-700">Theme</span>
                        </div>
                        <button
                          onClick={() =>
                            setTheme(theme === "light" ? "dark" : "light")
                          }
                          className="px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-600"
                        >
                          {theme.charAt(0).toUpperCase() + theme.slice(1)}
                        </button>
                      </div>

                      {/* Language Selection */}
                      <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-50 rounded-lg text-green-600">
                            <Globe size={20} />
                          </div>
                          <span className="text-gray-700">Language</span>
                        </div>
                        <select className="px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-600 outline-none">
                          <option>English</option>
                          <option>Spanish</option>
                          <option>French</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      Quick Actions
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button className="flex items-center justify-center gap-2 p-3 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-indigo-600 transition-colors">
                        <Video size={20} />
                        <span>Video Call</span>
                      </button>
                      <button className="flex items-center justify-center gap-2 p-3 bg-green-50 hover:bg-green-100 rounded-lg text-green-600 transition-colors">
                        <Phone size={20} />
                        <span>Voice Call</span>
                      </button>
                      <button className="flex items-center justify-center gap-2 p-3 bg-blue-50 hover:bg-blue-100 rounded-lg text-blue-600 transition-colors">
                        <Mic size={20} />
                        <span>Voice Note</span>
                      </button>
                      <button className="flex items-center justify-center gap-2 p-3 bg-purple-50 hover:bg-purple-100 rounded-lg text-purple-600 transition-colors">
                        <SendHorizontal size={20} />
                        <span>Quick Send</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-0 px-4">
                {quickStats.map((stat, index) => (
                  <div
                    key={index}
                    className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-indigo-100 rounded-lg text-indigo-600">
                        {stat.icon}
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-gray-800">
                          {stat.value}
                        </p>
                        <p className="text-sm text-gray-600">{stat.label}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
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
        className={`fixed bottom-4 right-0 transform transition-all duration-500 ease-in-out ${
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
const StyledWrapper = styled.div`
  /* The switch - the box around the slider */
  .switch {
    display: block;
    --width-of-switch: 3.5em;
    --height-of-switch: 2em;
    /* size of sliding icon -- sun and moon */
    --size-of-icon: 1.4em;
    /* it is like a inline-padding of switch */
    --slider-offset: 0.3em;
    position: relative;
    width: var(--width-of-switch);
    height: var(--height-of-switch);
  }

  /* Hide default HTML checkbox */
  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  /* The slider */
  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #f4f4f5;
    transition: 0.4s;
    border-radius: 30px;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: var(--size-of-icon, 1.4em);
    width: var(--size-of-icon, 1.4em);
    border-radius: 20px;
    left: var(--slider-offset, 0.3em);
    top: 50%;
    transform: translateY(-50%);
    background: linear-gradient(40deg, #ff0080, #ff8c00 70%);
    transition: 0.4s;
  }

  input:checked + .slider {
    background-color: #303136;
  }

  input:checked + .slider:before {
    left: calc(
      100% - (var(--size-of-icon, 1.4em) + var(--slider-offset, 0.3em))
    );
    background: #303136;
    /* change the value of second inset in box-shadow to change the angle and direction of the moon  */
    box-shadow: inset -3px -2px 5px -2px #8983f7, inset -10px -4px 0 0 #a3dafb;
  }
`;

export default Home;
