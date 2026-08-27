import React, { useEffect, useState, useMemo, useContext, useRef } from "react";
import { auth } from "../Firebase/firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { useGetUserInfo } from "../hooks/useGetUserInfo";
import { io } from "socket.io-client";
import { nanoid } from "nanoid";
import { socketContext } from "../contexts/socketContext";
import { GetRoomInfo } from "../hooks/useGetRoomInfo";
import BlurText from "../components/BlurText";
import {generateToken} from "../Firebase/firebase";
import { onMessage } from "firebase/messaging";
import toast, { Toaster, resolveValue } from 'react-hot-toast';
import { privFalse, privTrue, notifTrue, notifFalse } from "../hooks/useToasts";
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
  Plus,
  MessageSquareMore,
  MessageSquarePlus,
  Users2,
  Camera,
  Settings,
  Save,
  Loader2,
  Pencil,
} from "lucide-react";
import axios from "axios";
import { AiOutlineUser } from "react-icons/ai";
import { RxExit } from "react-icons/rx";
import { TbSettings } from "react-icons/tb";
import { CiCreditCard1 } from "react-icons/ci";
import { BiSupport } from "react-icons/bi";
import styled from "styled-components";
import { Sidebar } from "../components/Sidebar";
import { MdOutlineMoreVert } from "react-icons/md";
import { useFirestore } from "../hooks/useFirestore";
import  ThemeContext  from "../contexts/ThemeContext";
import PwaPrompt from "../components/PwaPrompt";
import {messaging} from "../Firebase/firebase";
import { SOCKET_URL } from "../lib/config";

function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const { isAuth, email, displayName, profilePicUrl } = useGetUserInfo(); // Assume `user` contains displayName and profile picture
  const [onlineUsers, setOnlineUsers] = useState([]);
  const { socket, setSocket } = useContext(socketContext);
  // setSocket(useMemo(() => io("http://localhost:5000"), []));
  const [joinInfo, setJoinInfo] = useState({});
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupPic, setGroupPic] = useState(null);
  const [groupPicPreview, setGroupPicPreview] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groups, setGroups] = useState(() => {
    const saved = localStorage.getItem("groups");
    return saved ? JSON.parse(saved) : [];
  });
  const [showOnlineUsers, setShowOnlineUsers] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const profileRef = useRef(null);
  const userRef = useRef(null);
  const menuRef = useRef(null);
  const [isOnline, setIsOnline] = useState("online");
  const [statusMessage, setStatusMessage] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  // Profile management + Settings
  const [profile, setProfile] = useState(() => {
    const authInfo = JSON.parse(localStorage.getItem("auth-info") || "{}");
    return {
      displayName: authInfo.displayName || displayName,
      profilePicUrl:
        authInfo.profilePicUrl ||
        profilePicUrl ||
        "https://t3.ftcdn.net/jpg/02/43/30/32/240_F_243303238_bimcrcQFzIPFlQQEWtU54tcPG5SnmsZD.jpg",
      bio: authInfo.bio || "",
    };
  });
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editProfile, setEditProfile] = useState(profile);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [notifications, setNotifications] = useState(() => {
    const savedNotifications = localStorage.getItem("notifications");
    return savedNotifications ? JSON.parse(savedNotifications) : {};
  });
  const {isDarkMode, setIsDarkMode}=useContext(ThemeContext)
  const {
    getRegisteredUsers,
    createGroup: createGroupDoc,
    getUserGroups,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    getFriendData,
    getUsersByEmails,
  } = useFirestore();

  const [users, setUsers]=useState(()=>{
    const savedUsers=localStorage.getItem("registeredUsers")
    return savedUsers?JSON.parse(savedUsers):[]
  })

  // Friends model (durable in Firestore, keyed by email).
  const [friends, setFriends] = useState([]); // profile objects {email, displayName, profilePicUrl}
  const [friendEmails, setFriendEmails] = useState([]); // emails, for quick membership checks
  const [friendRequests, setFriendRequests] = useState([]); // incoming, profile objects
  const [sentRequests, setSentRequests] = useState([]); // outgoing emails

  const quickStats = [
    { icon: <Users />, label: "Online Friends", value: "12" },
    { icon: <MessageSquare />, label: "Active Chats", value: "5" },
    { icon: <Heart />, label: "Favorite Groups", value: "3" },
  ];

  const [notif, setNotif] = useState(true);
  const [privacyMode, setPrivacyMode] = useState(false);

  const toggles = [
    {
      icon: <Bell />,
      label: "Notifications",
      state: notif,
      toggle: () => {
        if (!notif) {
          notifTrue();
        } else {
          notifFalse(); // Call when disabling Privacy Mode
        }
        setNotif(!notif);
      },
    },
    {
      icon: <Lock />,
      label: "Privacy Mode",
      state: privacyMode,
      toggle: () => {
        if (!privacyMode) {
          privTrue();
        } else {
          privFalse(); // Call when disabling Privacy Mode
        }
        setPrivacyMode(!privacyMode);
      },
    }
    
  ];
  

  const handleStatusUpdate = () => {
    socket.emit("join", {
      displayName,
      email,
      profilePicUrl,
      status: statusMessage,
      isOnline,
    });

    setStatusMessage("");
  };

  const handleOnline = () => {
    setIsOnline((prevState) => {
      const newStatus = prevState === "online" ? "offline" : "online";

      // Emit the updated status AFTER setting state
      socket.emit("join", {
        displayName,
        email,
        profilePicUrl,
        status: statusMessage,
        isOnline: newStatus,
      });
      localStorage.setItem("isOnline", newStatus);

      return newStatus; // Update state with the new value
    });
  };

  useEffect(() => {
    setSocket(io(SOCKET_URL));
  }, []);

  useEffect(()=>{
    generateToken();
    onMessage(messaging, (payload) => {
      console.log("Message received. ", payload);
    });
  },[])

  useEffect(() => {
    localStorage.setItem("notifications", JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem("theme", JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  // Persist groups so they survive reloads.
  useEffect(() => {
    localStorage.setItem("groups", JSON.stringify(groups));
  }, [groups]);

  // Durable source of truth: load the groups this user belongs to from
  // Firestore. This reaches members who were offline when the group was made.
  useEffect(() => {
    if (!email) return;
    (async () => {
      const dbGroups = await getUserGroups(email);
      if (dbGroups.length) {
        setGroups((prev) => {
          const byId = new Map(prev.map((g) => [g.id, g]));
          dbGroups.forEach((g) => byId.set(g.id, g));
          return [...byId.values()];
        });
      }
    })();
  }, [email]);

  // Load the friend graph (friends + incoming requests + sent requests) and
  // resolve emails into profile objects for rendering.
  useEffect(() => {
    if (!email) return;
    (async () => {
      const { friends: fEmails, friendRequests: reqEmails, sentRequests: sent } =
        await getFriendData(email);
      setFriendEmails(fEmails);
      setSentRequests(sent);
      const [friendProfiles, requestProfiles] = await Promise.all([
        getUsersByEmails(fEmails),
        getUsersByEmails(reqEmails),
      ]);
      setFriends(friendProfiles);
      setFriendRequests(requestProfiles);
    })();
  }, [email]);

  useEffect(() => {
    const getUsers = async () => {
      const localUsers = localStorage.getItem("registeredUsers");
      if (!localUsers) {
        // const registeredUsers = await getRegisteredUsers();
        setRegisteredUsers(registeredUsers);
        localStorage.setItem(
          "registeredUsers",
          JSON.stringify(registeredUsers)
        );
        console.log("Registered Users Loaded");
      } else {
        setRegisteredUsers(JSON.parse(localUsers));
        console.log("Local Users Loaded");
      }
    };
    getUsers();

    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfile(false);
      }
      if (userRef.current && !userRef.current.contains(event.target)) {
        setShowOnlineUsers(false);
      }
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
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
    const htmlElement = document.documentElement;
    if (isDarkMode) {
      htmlElement.classList.add("dark");
    } else {
      htmlElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (displayName && socket) {
      setIsLoading(true);
  
      const fetchUsers = async () => {
        try {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const newUsers = await getRegisteredUsers();
          setUsers(newUsers);
          console.log("DB users loaded", newUsers);
          localStorage.setItem("registeredUsers", JSON.stringify(newUsers));
        } catch (error) {
          console.error("Error fetching users:", error);
        } finally {
          setIsLoading(false); // Ensure loading is false after fetching
        }
      };
  
      setIsOnline((prevState) => {
        const newState = localStorage.getItem("isOnline") || "online";
  
        socket.emit("join", {
          displayName,
          email,
          profilePicUrl,
          status: statusMessage,
          isOnline: newState,
        });
  
        return newState;
      });
  
      socket.on("onlineUsers", (users) => {
        setOnlineUsers(users);
      });
  
      socket.on("message-notif", (message, username, roomId) => {
        let roomMessages = JSON.parse(localStorage.getItem(`messages_${roomId}`)) || [];
        roomMessages.push(message);
        localStorage.setItem(`messages_${roomId}`, JSON.stringify(roomMessages));
  
        setNotifications((prevNotifications) => ({
          ...prevNotifications,
          [username]: (prevNotifications[username] || 0) + 1,
        }));
      });
  
      socket.on("requestJoin", ({ from, roomId }) => {
        setJoinInfo({ from, roomId });
        localStorage.setItem(from, roomId);
        setIsVisible(true);
      });
  
      socket.on("groupCreated", (group) => {
        // Broadcast to everyone — only add it if I'm actually a member.
        if (group.members && email && !group.members.includes(email)) return;
        setGroups((prev) =>
          prev.some((g) => g.id === group.id) ? prev : [...prev, group]
        );
      });

      socket.on("groupDeleted", (groupId) => {
        setGroups((prev) => prev.filter((g) => g.id !== groupId));
      });

      // Someone sent ME a friend request (broadcast → filter by my email).
      socket.on("friendRequest", ({ from, toEmail }) => {
        if (!from || toEmail !== email) return;
        setFriendRequests((prev) =>
          prev.some((r) => r.email === from.email) ? prev : [...prev, from]
        );
        toast(`${from.displayName || "Someone"} sent you a friend request`);
      });

      // Someone ACCEPTED my request → we're now friends.
      socket.on("friendAccepted", ({ by, toEmail }) => {
        if (!by || toEmail !== email) return;
        setFriends((prev) =>
          prev.some((f) => f.email === by.email) ? prev : [...prev, by]
        );
        setFriendEmails((prev) =>
          prev.includes(by.email) ? prev : [...prev, by.email]
        );
        setSentRequests((prev) => prev.filter((e) => e !== by.email));
        toast(`${by.displayName || "Someone"} accepted your friend request`);
      });
  
      if (users.length === 0) {
        fetchUsers(); // Call fetchUsers only if users are empty
      } else {
        setIsLoading(false); // If users exist, stop loading
      }
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
    localStorage.setItem(user.name, roomId);
    notifications[user.name] = 0;
    localStorage.setItem("notifications", JSON.stringify(notifications));
    setJoinInfo({ from: displayName, roomId });
    const userData = user;
    // Persist room metadata so a page refresh on /chat doesn't lose it.
    localStorage.setItem(`room_${roomId}`, JSON.stringify(userData));
    navigate(`/chat/${roomId}`, { state: { userData } });
    socket.emit("requestJoin", { from: displayName, to: user.id, roomId });
  };

  // Joining a group: everyone shares the SAME room (the group's id), so the
  // whole group lands in one chat instead of separate random rooms.
  const handleJoinGroup = (group) => {
    const roomId = group.id;
    const userData = { ...group, isGroup: true };
    localStorage.setItem(`room_${roomId}`, JSON.stringify(userData));
    navigate(`/chat/${roomId}`, { state: { userData } });
  };

  //FRIENDS LOGIC
  const handleSendFriendRequest = async (onlineUser) => {
    if (!email || !onlineUser?.email) return;
    // Persist durably, optimistically mark as sent, then relay live.
    await sendFriendRequest(email, onlineUser.email);
    setSentRequests((prev) =>
      prev.includes(onlineUser.email) ? prev : [...prev, onlineUser.email]
    );
    if (socket) {
      socket.emit("friendRequest", {
        from: {
          email,
          displayName: profile.displayName,
          profilePicUrl: profile.profilePicUrl,
        },
        toEmail: onlineUser.email,
      });
    }
    toast(`Friend request sent to ${onlineUser.name || onlineUser.displayName}`);
  };

  const handleAcceptFriend = async (requester) => {
    if (!email || !requester?.email) return;
    await acceptFriendRequest(email, requester.email);
    // Locally: move requester into friends, drop from requests.
    setFriends((prev) =>
      prev.some((f) => f.email === requester.email) ? prev : [...prev, requester]
    );
    setFriendEmails((prev) =>
      prev.includes(requester.email) ? prev : [...prev, requester.email]
    );
    setFriendRequests((prev) => prev.filter((r) => r.email !== requester.email));
    if (socket) {
      socket.emit("friendAccepted", {
        by: {
          email,
          displayName: profile.displayName,
          profilePicUrl: profile.profilePicUrl,
        },
        toEmail: requester.email,
      });
    }
  };

  const handleDeclineFriend = async (requester) => {
    if (!email || !requester?.email) return;
    await declineFriendRequest(email, requester.email);
    setFriendRequests((prev) => prev.filter((r) => r.email !== requester.email));
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

  //PROFILE MANAGEMENT LOGIC
  const openProfileModal = () => {
    setEditProfile(profile);
    setAvatarPreview(null);
    setAvatarFile(null);
    setShowProfileModal(true);
    setShowProfile(false);
    setShowMenu(false);
  };

  const openSettingsModal = () => {
    setShowSettingsModal(true);
    setShowProfile(false);
    setShowMenu(false);
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleSaveProfile = async () => {
    if (!editProfile.displayName.trim()) {
      toast("Display name can't be empty");
      return;
    }
    setIsSavingProfile(true);
    try {
      let newPicUrl = editProfile.profilePicUrl;

      // Upload new avatar to Cloudinary if one was picked
      if (avatarFile) {
        const formData = new FormData();
        formData.append("file", avatarFile);
        formData.append("upload_preset", "ml_default");
        const response = await axios.post(
          "https://api.cloudinary.com/v1_1/dzlr1rtln/image/upload",
          formData
        );
        newPicUrl = response.data.secure_url;
      }

      const authInfo = JSON.parse(localStorage.getItem("auth-info") || "{}");
      const updatedAuth = {
        ...authInfo,
        displayName: editProfile.displayName.trim(),
        profilePicUrl: newPicUrl,
        bio: editProfile.bio,
      };
      localStorage.setItem("auth-info", JSON.stringify(updatedAuth));

      const newProfile = {
        displayName: editProfile.displayName.trim(),
        profilePicUrl: newPicUrl,
        bio: editProfile.bio,
      };
      setProfile(newProfile);

      // Let other online users see the updated name / avatar
      if (socket) {
        socket.emit("join", {
          displayName: newProfile.displayName,
          email,
          profilePicUrl: newProfile.profilePicUrl,
          status: statusMessage,
          isOnline,
        });
      }

      toast("Profile updated");
      setShowProfileModal(false);
    } catch (err) {
      console.error("Error updating profile:", err);
      toast("Couldn't update profile. Try again.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  //REQUEST MODAL LOGIC
  const [isVisible, setIsVisible] = useState(false);

  const handleAccept = (userData) => {
    setIsVisible(false);
    navigate(`/chat/${joinInfo.roomId}`, { state: { userData } });
  };

  const handleDecline = () => {
    setIsVisible(false);
  };

  //GROUP LOGIC
  // For groups, `selectedUsers` holds member EMAILS (see the group modal).
  const handleCreateGroup = async () => {
    if (groupName.trim() === "") {
      alert("Please enter a group name.");
      return;
    }

    if (selectedUsers.length === 0) {
      alert("Please select at least one user to add to the group.");
      return;
    }

    // Upload the group picture (if one was chosen) to Cloudinary.
    let groupPicUrl = "";
    if (groupPic) {
      try {
        const formData = new FormData();
        formData.append("file", groupPic);
        formData.append("upload_preset", "ml_default");
        const response = await axios.post(
          "https://api.cloudinary.com/v1_1/dzlr1rtln/image/upload",
          formData
        );
        groupPicUrl = response.data.secure_url;
      } catch (err) {
        console.error("Error uploading group picture:", err);
      }
    }

    // Members = the selected emails + the creator, de-duped.
    const members = Array.from(new Set([...selectedUsers, email].filter(Boolean)));
    const group = {
      id: nanoid(),
      name: groupName.trim(),
      members,
      createdBy: email,
      groupPicUrl,
    };

    // Persist durably (survives reloads, reaches offline members on next login)
    await createGroupDoc(group);
    // Optimistic local add for the creator
    setGroups((prev) =>
      prev.some((g) => g.id === group.id) ? prev : [...prev, group]
    );
    // Live relay so online members see it immediately
    if (socket) socket.emit("createGroup", group);

    // Close the modal and reset the state
    setIsGroupModalOpen(false);
    setGroupName("");
    setGroupPic(null);
    setGroupPicPreview(null);
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

    setIsUserModalOpen(false);
    setSelectedUsers([]);
  };

  return (
    
    <div className="min-h-100dvdh flex flex-col bg-gray-100">
  <Toaster>
      {(t) => (
        <div
          className={`transition-all duration-300 ease-in-out transform ${
            t.visible ? "opacity-85 scale-100" : "opacity-0 scale-95"
          }  mt-3 bg-white/80 backdrop-blur-md shadow-lg text-gray-900 px-4 py-2 rounded-lg  dark:bg-gray-800/80 dark:text-gray-100 dark:border-gray-700`}
        >
          {resolveValue(t.message, t)}
        </div>
      )}
    </Toaster>
      {/* Header with Display Name and Icon */}
      <header className="dark:bg-[rgb(21,21,21)] shadow-3xl  bg- p-4 flex justify-between items-center">
        {/* Profile Section */}
        <div className=" relative flex items-center space-x-4 header-item">
         {showProfile && (
  <div
    ref={profileRef}
    className="hidden sm:block p-3 z-50 shadow-2xl absolute left-[-6px] top-13 mt-2 w-56 sm:w-64 bg-gray-50 dark:bg-gray-800 shadow-xl rounded-2xl overflow-hidden transform scale-95 transition-all duration-200"
  >
    <div className="p-4 gap-2 justify-start flex flex-row items-center">
      <img
        src={profile.profilePicUrl}
        alt="Profile"
        className="w-12 h-12 sm:w-13 sm:h-13 rounded-full border border-gray-300 dark:border-gray-700 shadow-sm object-cover"
      />
      <div className="min-w-0">
        <h3 className="text-md sm:text-lg font-bold text-gray-800 dark:text-gray-100 truncate">
          {profile.displayName}
        </h3>
        <h5 className="text-xs sm:text-sm text-gray-400 dark:text-gray-300 truncate">
          {email || "No email"}
        </h5>
      </div>
    </div>

    <div className="border-t border-gray-300 dark:border-gray-700">
      <button
        onClick={openProfileModal}
        className="mt-1 cursor-pointer gap-4 flex justify-start w-full rounded-xl px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900 hover:text-blue-600 dark:hover:text-blue-300 flex items-center transition duration-300"
      >
        <AiOutlineUser /> Edit Profile
      </button>
      <button
        onClick={openSettingsModal}
        className="cursor-pointer gap-4 flex justify-start w-full rounded-xl px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900 hover:text-blue-600 dark:hover:text-blue-300 flex items-center transition duration-300"
      >
        <TbSettings /> Settings
      </button>
      <div className="mt-1 border-t border-gray-300 dark:border-gray-700">
        <button
          className="mt-1 cursor-pointer gap-4 flex justify-start w-full rounded-xl px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900 hover:text-blue-600 dark:hover:text-blue-300 flex items-center transition duration-300"
        >
          <CiCreditCard1 /> Subscription
        </button>
        <button
          className="cursor-pointer gap-4 flex justify-start w-full rounded-xl px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900 hover:text-blue-600 dark:hover:text-blue-300 flex items-center transition duration-300"
        >
          <BiSupport /> Support
        </button>
      </div>
      <div className="mt-1 border-t border-gray-300 dark:border-gray-700">
        <button
          className="mt-1 cursor-pointer gap-4 flex justify-start w-full rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900 flex items-center transition duration-300"
          onClick={handleSignOut}
        >
          <RxExit /> Sign Out
        </button>
      </div>
    </div>
  </div>
)}

          {/* Avatar trigger */}
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="cursor-pointer flex-shrink-0 rounded-full ring-2 ring-transparent hover:ring-blue-400 focus:ring-blue-500 transition duration-300"
          >
            <img
              src={profile.profilePicUrl}
              alt="Profile"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-gray-300 dark:border-gray-700 object-cover"
            />
          </button>

          {/* Display Name */}
          <div>

          <BlurText
  text="TetherChat"
  delay={50}
  animateBy="letters"
  direction="top"
  className="dark:text-white text-3xl sm:text-4xl font-bold text-black "
/>


          </div>
        </div>

        {/* Online Users and Sign Out Button */}
        <div className="flex items-center space-x-4">
          <div className="hidden sm:block relative">
            <input
              placeholder="Search..."
              className="input dark:bg-gray-800 dark:text-white shadow-lg focus:border-2 border-gray-300 dark:border-gray-700 px-5 py-3 rounded-xl w-80 transition-all focus:w-94 outline-none"
              name="search"
              type="search"
            />
            <svg
              className="dark:text-white size-6 absolute top-3 right-3 text-gray-500"
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
              <input
                type="checkbox"
                checked={isDarkMode}
                onChange={() => setIsDarkMode(!isDarkMode)}
              />
              <span className="slider" />
            </label>
          </StyledWrapper>
          <button
            onClick={openSettingsModal}
            className=" cursor-pointer hidden sm:block text-gray-600 dark:hover:bg-gray-600 hover:bg-gray-200 p-2 rounded-full transition duration-300"
          >
            <TbSettings className="dark:text-white text-black w-5 h-5 sm:w-7 sm:h-7" />
          </button>
          {/* Online Users Button */}
          <div ref={userRef} className="relative header-item">
            <button
              onClick={() => setShowOnlineUsers(!showOnlineUsers)}
              className="dark:hover:bg-gray-600 cursor-pointer text-gray-600 hover:bg-gray-200 p-2 rounded-full transition duration-300"
            >
              <Users className="dark:text-white text-black w-5 h-5 sm:w-6 sm:h-6" />
              {onlineUsers.length > 0 && (
                <span className="font-bold absolute top-0 right-0 bg-red-500 dark:bg-[#A5C5E9] dark:text-gray-900 text-white text-xs rounded-full px-1 py-0">
                  {onlineUsers.length}
                </span>
              )}
            </button>

            {showOnlineUsers && (
              <div className="z-50 absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 shadow-lg rounded-lg p-3 dark:border border-gray-700">
                <h3 className="text-sm font-semibold dark:text-gray-200 p-3 border-b border-gray-700">
                  Online Users ({onlineUsers.length})
                </h3>
                <div className="max-h-64 overflow-y-auto">
                  {onlineUsers.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => handleJoinRoom(user)}
                      className="flex mt-2 rounded-lg justify-between items-center p-3 cursor-pointer transition duration-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <div className="flex">
                        <img
                          src={user.profilePicUrl}
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full mr-3"
                          alt={user.name}
                        />
                        <div className="flex flex-col">
                          <span className="text-sm sm:text-base text-gray-800 dark:text-gray-200">
                            {user.name}
                          </span>
                          <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                            {user.status || "Available"}
                          </span>
                        </div>
                      </div>
                      <MessageSquareMore className="text-gray-600 dark:text-gray-400 transition duration-300 ease-in-out hover:text-gray-800 dark:hover:text-gray-200" />
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
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="dark:bg-gray-900 dark:text-white sm:hidden cursor-pointer text-2xl text-black font-bold"
          >
            <MdOutlineMoreVert />
          </button>
        </div>
      </header>
      {/* Menu With Options */}
      {showMenu && (
        <div
          ref={menuRef}
          className={`p-3 z-50 absolute right-3 top-13 mt-2 w-64 rounded-2xl overflow-hidden transform scale-95 transition-all duration-200 
        ${
          isDarkMode
            ? "bg-gray-800/80 backdrop-blur-md shadow-lg border border-gray-700/50"
            : "bg-white/80 backdrop-blur-md shadow-lg border border-gray-200/50"
        }`}
        >
          {/* Profile header */}
          <div className="flex items-center gap-3 px-4 py-3">
            <img
              src={profile.profilePicUrl}
              alt="Profile"
              className="w-11 h-11 rounded-full object-cover border border-gray-300 dark:border-gray-700"
            />
            <div className="min-w-0">
              <p
                className={`text-sm font-semibold truncate ${
                  isDarkMode ? "text-gray-100" : "text-gray-800"
                }`}
              >
                {profile.displayName}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {email || "No email"}
              </p>
            </div>
          </div>
          <div
            className={`grid grid-cols-2 gap-2 px-3 pb-2 border-b ${
              isDarkMode ? "border-gray-700" : "border-gray-300"
            }`}
          >
            <button
              onClick={openProfileModal}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition
              ${
                isDarkMode
                  ? "bg-gray-700 text-gray-200 hover:bg-gray-600"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <Pencil size={16} /> Profile
            </button>
            <button
              onClick={openSettingsModal}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition
              ${
                isDarkMode
                  ? "bg-gray-700 text-gray-200 hover:bg-gray-600"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <Settings size={16} /> Settings
            </button>
          </div>
          <div className="border-gray-300 py-2">
            {toggles.map((toggle, index) => (
              <div
                key={index}
                className={`flex justify-between items-center px-4 py-3 transition
              ${isDarkMode ? "hover:bg-gray-700" : "hover:bg-blue-50"}`}
              >
                <div className="flex items-center gap-3">
                  <span className={isDarkMode ? "text-gray-300" : ""}>
                    {toggle.icon}
                  </span>
                  <span
                    className={`text-sm ${
                      isDarkMode ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {toggle.label}
                  </span>
                </div>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={toggle.state}
                    onChange={toggle.toggle}
                    className="sr-only peer"
                  />
                  <div
                    className={`relative w-11 h-6 rounded-full peer 
                peer-focus:ring-4 
                peer-focus:ring-blue-300 
                dark:peer-focus:ring-blue-800 
                peer-checked:after:translate-x-full 
                peer-checked:after:border-white 
                after:content-[''] 
                after:absolute 
                after:top-0.5 
                after:left-[2px] 
                after:bg-white 
                after:border-gray-300 
                after:border 
                after:rounded-full 
                after:h-5 
                after:w-5 
                after:transition-all 
                peer-checked:bg-blue-600
                ${isDarkMode ? "bg-gray-600" : "bg-gray-200"}`}
                  ></div>
                </label>
              </div>
            ))}
          </div>

          <div
            className={`border-t px-4 py-3 ${
              isDarkMode ? "border-gray-700" : "border-gray-300"
            }`}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className={isDarkMode ? "text-gray-300" : ""}>
                  <Globe size={18} />
                </span>
                <span
                  className={`text-sm ${
                    isDarkMode ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  Online Status
                </span>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isOnline === "online"}
                  onChange={handleOnline}
                  className="sr-only peer"
                />
                <div
                  className={`relative w-11 h-6 rounded-full peer 
              peer-focus:ring-4 
              peer-focus:ring-blue-300 
              dark:peer-focus:ring-blue-800 
              peer-checked:after:translate-x-full 
              peer-checked:after:border-white 
              after:content-[''] 
              after:absolute 
              after:top-0.5 
              after:left-[2px] 
              after:bg-white 
              after:border-gray-300 
              after:border 
              after:rounded-full 
              after:h-5 
              after:w-5 
              after:transition-all 
              peer-checked:bg-blue-600
              ${isDarkMode ? "bg-gray-600" : "bg-gray-200"}`}
                ></div>
              </label>
            </div>
          </div>

          <div
            className={`border-t ${
              isDarkMode ? "border-gray-700" : "border-gray-300"
            }`}
          >
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`w-full flex items-center justify-between px-4 py-3 transition
            ${
              isDarkMode
                ? "hover:bg-gray-700 text-gray-300"
                : "hover:bg-blue-50 text-gray-700"
            }`}
            >
              <div className="flex items-center gap-3">
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                <span className="text-sm">
                  {isDarkMode ? "Light Mode" : "Dark Mode"}
                </span>
              </div>
            </button>

            <button
              onClick={handleSignOut}
              className={`w-full flex items-center justify-between px-4 py-3 transition
            ${
              isDarkMode
                ? "text-red-400 hover:bg-gray-700"
                : "text-red-600 hover:bg-red-50"
            }`}
            >
              <div className="flex items-center gap-3">
                <LogOut size={18} />
                <span className="text-sm">Sign Out</span>
              </div>
            </button>
          </div>
        </div>
      )}
      <main
        style={{ minHeight: "100vh" }}
        className={`${isDarkMode ? "bg-gray-900" : "bg-white"}`}
      >
        <div className="flex flex-row">
          <Sidebar
            isLoading={isLoading}
            users={users}
            notif={notif}
            notifications={notifications}
            displayName={displayName}
            email={email}
            onlineUsers={onlineUsers}
            groups={groups}
            friends={friends}
            friendEmails={friendEmails}
            sentRequests={sentRequests}
            friendRequests={friendRequests}
            handleJoinRoom={handleJoinRoom}
            handleJoinGroup={handleJoinGroup}
            handleSendFriendRequest={handleSendFriendRequest}
            handleAcceptFriend={handleAcceptFriend}
            handleDeclineFriend={handleDeclineFriend}
            registeredUsers={registeredUsers}
          />
          <div
            style={{
              minHeight: "100vh",
              flexDirection: "column",
              minWidth: "80%",
            }}
            className={`sm:block hidden text-center flex justify-center items-center p-5 shadow-lg
            ${
              isDarkMode ? "bg-gray-900 text-white" : "bg-white text-gray-800"
            }`}
          >
            <div className="mt-0 w-full">
              <div className="mt-30">
                <h2
                  className={`text-3xl font-bold mb-4 ${
                    isDarkMode ? "text-white" : "text-gray-800"
                  }`}
                >
                  Welcome to the Chat App!
                </h2>
                <p
                  className={`text-lg max-w-md mx-auto ${
                    isDarkMode ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  Start connecting with friends by creating your first group.
                </p>

                {/* Create Group Button */}
                <button
                  onClick={() => setIsGroupModalOpen(true)}
                  className="cursor-pointer mt-4 mb-15 overflow-hidden relative w-38 p-2 h-12 bg-indigo-600 text-white border-none rounded-md text-xl font-bold cursor-pointer group"
                >
                  Create Group
                  <span className="absolute w-36 h-32 -top-8 -left-2 bg-indigo-400 rotate-12 transform scale-x-0 group-hover:scale-x-100 transition-transform group-hover:duration-500 duration-1000 origin-left" />
                  <span className="absolute w-36 h-32 -top-8 -left-2 bg-indigo-500 rotate-12 transform scale-x-0 group-hover:scale-x-100 transition-transform group-hover:duration-700 duration-700 origin-left" />
                  <span className="absolute w-36 h-32 -top-8 -left-2 bg-indigo-600 rotate-12 transform scale-x-0 group-hover:scale-x-50 transition-transform group-hover:duration-1000 duration-500 origin-left" />
                  <span className="ml-2 group-hover:opacity-100 group-hover:duration-1000 duration-100 opacity-0 absolute top-2.5 left-6 z-10">
                    Connect!
                  </span>
                </button>

                {/* Sections Grid */}
                <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto px-4 mb-8">
                  {/* Personal Status Section */}
                  <div
                    className={`rounded-xl shadow-sm p-6 
                  ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
                  >
                    <h3
                      className={`text-lg font-semibold mb-4 
                    ${isDarkMode ? "text-white" : "text-gray-800"}`}
                    >
                      Your Status
                    </h3>
                    <div className="flex flex-col justify-start gap-8 ">
                      <div className="mt-5 flex items-center justify-between">
                        <span
                          className={`${
                            isDarkMode ? "text-gray-300" : "text-gray-600"
                          }`}
                        >
                          Availability
                        </span>
                        <button
                          onClick={handleOnline}
                          className={`px-3 py-1 rounded-full flex items-center gap-2 cursor-pointer 
                          ${
                            isOnline === "online"
                              ? "bg-green-100 text-green-600"
                              : isDarkMode
                              ? "bg-gray-700 text-gray-300"
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
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="What's on your mind?"
                          value={statusMessage}
                          onChange={(e) => setStatusMessage(e.target.value)}
                          className={`w-full p-2 rounded-lg outline-none
                          ${
                            isDarkMode
                              ? "bg-gray-700 text-white placeholder-gray-400"
                              : "bg-white text-gray-800 focus:ring-2 focus:ring-indigo-200"
                          }`}
                        />
                        <button
                          onClick={handleStatusUpdate}
                          className={`cursor-pointer mr-3 absolute right-2 top-3 
                          ${
                            isDarkMode
                              ? "text-gray-400 hover:text-gray-200"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          <Send size={20} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Quick Settings */}
                  <div
                    className={`rounded-xl shadow-sm p-6 
                  ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
                  >
                    <h3
                      className={`text-lg font-semibold mb-4 
                    ${isDarkMode ? "text-white" : "text-gray-800"}`}
                    >
                      Quick Settings
                    </h3>
                    <div className="space-y-4">
                      <div
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer
                      ${isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                            <Palette size={20} />
                          </div>
                          <span
                            className={`${
                              isDarkMode ? "text-gray-200" : "text-gray-700"
                            }`}
                          >
                            Theme
                          </span>
                        </div>
                        <button
                          onClick={() => setIsDarkMode(!isDarkMode)}
                          className={` cursor-pointer px-5 py-2 rounded-full text-sm
                          ${
                            isDarkMode
                              ? "bg-gray-700 text-gray-300"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {isDarkMode ? "Dark" : "Light"}
                        </button>
                      </div>

                      {/* Quick Actions */}
                      <div
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer
                      ${isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-50 rounded-lg text-green-600">
                            <Globe size={20} />
                          </div>
                          <span
                            className={`${
                              isDarkMode ? "text-gray-300" : "text-gray-700"
                            }`}
                          >
                            Language
                          </span>
                        </div>
                        <select
                          className={`appearance-none cursor-pointer px-4 py-2 rounded-full text-sm outline-none
              ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300"
                  : "bg-gray-100 text-gray-600"
              }`}
                        >
                          <option>English</option>
                          <option>Spanish</option>
                          <option>French</option>
                        </select>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Quick Stats */}
                <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-0 px-4">
                  {quickStats.map((stat, index) => (
                    <div
                      key={index}
                      className={`p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow
                      ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-100 rounded-lg text-indigo-600">
                          {stat.icon}
                        </div>
                        <div>
                          <p
                            className={`text-2xl font-bold 
                          ${isDarkMode ? "text-white" : "text-gray-800"}`}
                          >
                            {stat.value}
                          </p>
                          <p
                            className={`text-sm 
                          ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                          >
                            {stat.label}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <button
        onClick={() => setIsUserModalOpen(true)}
        className="
    dark:bg-gray-600 dark:text-white
    fixed bottom-25 right-8 bg-blue-600 text-white p-4 rounded-full shadow-xl 
    hover:bg-blue-700 hover:scale-110 active:scale-95
    cursor-pointer
    transition-all duration-300 ease-in-out 
    flex items-center hover:gap-2 group"
      >
        <MessageSquarePlus className="w-6 h-6" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 ease-in-out whitespace-nowrap">
          New Chat
        </span>
      </button>


      {isUserModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-30 dark:bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md transform transition-all 
                   dark:border-gray-700"
          >
            {/* Header */}
            <div className="bg-blue-600 dark:bg-blue-800 text-white p-6 rounded-t-2xl">
              <h2 className="text-2xl font-bold flex items-center">
                <Users className="mr-3 w-8 h-8" />
                Create New Group
              </h2>
              <p className="text-sm text-white dark:text-blue-200 mt-2">
                Start Chatting with someone
              </p>
            </div>

            {/* Content */}
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-200">
                Select User to Chat With
              </h3>

              <div
                className="max-h-64 overflow-y-auto space-y-2 mb-4 
                        scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 
                        scrollbar-track-gray-200 dark:scrollbar-track-gray-800"
              >
                {onlineUsers.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => handleUserSelection(user.id)}
                    className={`flex items-center p-2 rounded-lg cursor-pointer transition 
                ${
                  selectedUsers.includes(user.id)
                    ? "bg-blue-100 dark:bg-blue-900 text-gray-900 dark:text-gray-100"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                }`}
                  >
                    <img
                      src={user.profilePicUrl}
                      alt={user.name}
                      className="w-10 h-10 rounded-full mr-3 border-2 border-gray-300 dark:border-gray-700 shadow-sm"
                    />
                    <span className="font-medium flex-grow">{user.name}</span>
                    {selectedUsers.includes(user.id) && (
                      <span className="text-blue-400">
                        <Check className="w-5 h-5" />
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex sm:justify-end justify-between space-x-3 pt-2">
                <button
                  onClick={() => setIsUserModalOpen(false)}
                  className="cursor-pointer px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateChat}
                  className="cursor-pointer px-6 py-2 bg-blue-600 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 shadow-md transition"
                >
                  Create Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsGroupModalOpen(true)}
        className="
    dark:bg-gray-600 dark:text-white
    fixed bottom-6 right-8 bg-blue-600 text-white p-3 rounded-full shadow-xl 
    hover:bg-blue-700 hover:scale-110 active:scale-95 
    transition-all duration-300 ease-in-out 
    cursor-pointer
    flex items-center justify-center hover:gap-2 group min-w-[55px] min-h-[55px]"
      >
        <Users className="w-7 h-7" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 ease-in-out whitespace-nowrap">
          Create Group
        </span>
      </button>
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md transform transition-all dark:border dark:border-gray-700">
            <div className="bg-blue-600 dark:bg-blue-800 text-white p-6 rounded-t-2xl">
              <h2 className="text-2xl font-bold flex items-center">
                <Users className="mr-3 w-8 h-8" />
                Create New Group
              </h2>
              <p className="text-sm text-blue-100 dark:text-blue-200 mt-2">
                Add members and give your group a name
              </p>
            </div>

            <div className="p-6">
              {/* Group picture + name */}
              <div className="flex items-center gap-4 mb-4">
                <div className="relative flex-shrink-0">
                  {groupPicPreview ? (
                    <img
                      src={groupPicPreview}
                      alt="Group"
                      className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-blue-500 text-white flex items-center justify-center text-2xl font-bold">
                      {groupName.trim()?.[0]?.toUpperCase() || <Users className="w-7 h-7" />}
                    </div>
                  )}
                  <label className="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded-full cursor-pointer shadow-md transition">
                    <Camera className="w-3.5 h-3.5" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          setGroupPic(file);
                          setGroupPicPreview(URL.createObjectURL(file));
                        }
                      }}
                    />
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="Group Name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="flex-1 p-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:outline-none transition
                  text-gray-900 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400"
                />
              </div>

              <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-200">
                Select Group Members
              </h3>

              <div
                className="max-h-64 overflow-y-auto space-y-2 mb-4 
                scrollbar-thin scrollbar-thumb-blue-300 scrollbar-track-blue-100
                dark:scrollbar-thumb-gray-600 dark:scrollbar-track-gray-800"
              >
                {/* Group members can only be picked from your friends. */}
                {friends.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
                    You have no friends yet. Add friends from the Online Users
                    list to invite them to a group.
                  </p>
                ) : (
                  friends.map((user) => (
                    <div
                      key={user.email}
                      className={`flex items-center p-2 rounded-lg cursor-pointer transition
                      ${
                        selectedUsers.includes(user.email)
                          ? "bg-blue-100 dark:bg-blue-900 dark:text-gray-100"
                          : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                      }`}
                      onClick={() => handleUserSelection(user.email)}
                    >
                      <img
                        src={user.profilePicUrl}
                        alt={user.displayName}
                        className="w-10 h-10 rounded-full mr-3 border-2 border-white dark:border-gray-700 shadow-sm"
                      />
                      <span className="font-medium flex-grow">{user.displayName}</span>
                      {selectedUsers.includes(user.email) && (
                        <span className="text-blue-600 dark:text-blue-400">
                          <Check className="w-5 h-5" />
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-between sm:justify-end space-x-3 pt-2">
                <button
                  onClick={() => {
                    setIsGroupModalOpen(false);
                    setGroupPic(null);
                    setGroupPicPreview(null);
                  }}
                  className="cursor-pointer px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGroup}
                  className="cursor-pointer px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md transition"
                >
                  Create Group
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div
        className={`hidden sm:block fixed bottom-4 right-0 transform transition-all duration-500 ease-in-out ${
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
              onClick={() => handleAccept({ name: joinInfo.from })}
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
      {/* Edit Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md transform transition-all dark:border dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="relative bg-gradient-to-r from-blue-600 to-indigo-600 p-6 pb-16">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <AiOutlineUser className="w-6 h-6" /> Edit Profile
                </h2>
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="cursor-pointer text-white/80 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Avatar */}
            <div className="flex justify-center -mt-12">
              <div className="relative">
                <img
                  src={avatarPreview || editProfile.profilePicUrl}
                  alt="Avatar"
                  className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-900 object-cover shadow-lg"
                />
                <label className="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full cursor-pointer shadow-md transition">
                  <Camera className="w-4 h-4" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </label>
              </div>
            </div>

            {/* Fields */}
            <div className="p-6 pt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editProfile.displayName}
                  onChange={(e) =>
                    setEditProfile({ ...editProfile, displayName: e.target.value })
                  }
                  placeholder="Your name"
                  className="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Email
                </label>
                <input
                  type="text"
                  value={email || ""}
                  disabled
                  className="w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Bio / Status
                </label>
                <textarea
                  rows={3}
                  value={editProfile.bio}
                  onChange={(e) =>
                    setEditProfile({ ...editProfile, bio: e.target.value })
                  }
                  placeholder="Tell people a little about yourself"
                  className="resize-none w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="cursor-pointer px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile}
                  className="cursor-pointer px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md transition flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingProfile ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {isSavingProfile ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md transform transition-all dark:border dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <Settings className="w-6 h-6" /> Settings
              </h2>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="cursor-pointer text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-1">
              {/* Dark mode */}
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
                    {isDarkMode ? <Moon size={18} /> : <Sun size={18} />}
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-200">
                    Dark Mode
                  </span>
                </div>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDarkMode}
                    onChange={() => setIsDarkMode(!isDarkMode)}
                    className="sr-only peer"
                  />
                  <div className="relative w-11 h-6 bg-gray-200 dark:bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>

              {/* Toggles: Notifications + Privacy */}
              {toggles.map((toggle, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300">
                      {toggle.icon}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-200">
                      {toggle.label}
                    </span>
                  </div>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={toggle.state}
                      onChange={toggle.toggle}
                      className="sr-only peer"
                    />
                    <div className="relative w-11 h-6 bg-gray-200 dark:bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                  </label>
                </div>
              ))}

              {/* Online status */}
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-lg bg-green-50 dark:bg-green-900/40 text-green-600 dark:text-green-300">
                    <Globe size={18} />
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-200">
                    Online Status
                  </span>
                </div>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOnline === "online"}
                    onChange={handleOnline}
                    className="sr-only peer"
                  />
                  <div className="relative w-11 h-6 bg-gray-200 dark:bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>

              {/* Language */}
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300">
                    <Palette size={18} />
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-200">
                    Language
                  </span>
                </div>
                <select className="appearance-none cursor-pointer px-4 py-2 rounded-full text-sm outline-none bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  <option>English</option>
                  <option>Spanish</option>
                  <option>French</option>
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  openProfileModal();
                }}
                className="cursor-pointer text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
              >
                <Pencil size={16} /> Edit Profile
              </button>
              <button
                onClick={handleSignOut}
                className="cursor-pointer text-sm text-red-600 dark:text-red-400 hover:underline flex items-center gap-2"
              >
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      <PwaPrompt/>

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
