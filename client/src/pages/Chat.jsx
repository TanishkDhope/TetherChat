import React, { useState, useRef, useEffect, useContext, useMemo } from "react";
import { nanoid } from "nanoid";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCheck } from "lucide-react";
import { useSocket } from "../hooks/useSocket";
import { useGetUserInfo } from "../hooks/useGetUserInfo";
import { useApi } from "../hooks/useApi";
import { FaCamera } from "react-icons/fa";
import { MdOutlineMoreVert } from "react-icons/md";
import { IoSearchSharp } from "react-icons/io5";
import { BiSolidVideo } from "react-icons/bi";
import { PiStickerBold } from "react-icons/pi";
import { BsEmojiGrin } from "react-icons/bs";
import { RiSendPlaneFill } from "react-icons/ri";
import { ChatSkeleton } from "../components/ChatSkeleton";
import SmartReplyChips from "../components/SmartReplyChips";
import { useSmartReplies } from "../hooks/useSmartReplies";
import { toTurns } from "../lib/smartReplies";
import ThemeContext from "../contexts/ThemeContext";
import { MdCheck } from "react-icons/md";
import { useTransition, animated } from '@react-spring/web';
import toast, { Toaster } from 'react-hot-toast';

const notify = () => toast('Here is your toast.');
const bubbleThemes = [
  {
    name: "Default",
    sent: {
      bg: "bg-blue-500",
      text: "text-white",
    },
    received: {
      bg: "bg-gray-800",
      text: "text-white",
    },
  },
  {
    name: "Forest",
    sent: {
      bg: "bg-[#738BD8] dark:bg-[rgb(133,116,238)]",
      text: "text-white",
    },
    received: {
      bg: "bg-[rgb(45,50,68)] dark:bg-[rgb(44,51,68)]",
      text: "text-white",
    },
  },
];

const backgrounds = [
  {
    name: "Leaves",
    lightPreview:
      "url(https://i.pinimg.com/736x/18/5e/6f/185e6fe7d2cc5be9fc9156928daf708d.jpg)",
    darkClass: "dark:bg-gray-900",
  },
  {
    name: "Ocean",
    lightPreview:
      "url(https://i.pinimg.com/736x/28/81/7b/28817bf58ec5b390956117e8f603d692.jpg)",
    darkClass: "dark:bg-sky-950",
  },
  {
    name: "Forest",
    lightPreview:
      "url(https://i.pinimg.com/736x/b5/39/38/b5393867f0b5fcb64858afe1c918672d.jpg)",
    darkClass: "dark:bg-green-950",
  },
  {
    name: "Sunset",
    lightPreview:
      "url(https://i.pinimg.com/736x/82/06/1b/82061b4202291f8918220f3e5d684133.jpg)",
    darkClass: "dark:bg-orange-950",
  },
];

const STICKER_PACKS = {
  basic: [
    "👍",
    "❤️",
    "😊",
    "🎉",
    "🌟",
    "🔥",
    "👋",
    "🤝",
    "✨",
    "💯",
    "🏆",
    "🎮",
    "🎸",
    "🎨",
    "📚",
    "💻",
  ],
  animals: [
    "🐶",
    "🐱",
    "🐼",
    "🐨",
    "🦊",
    "🦁",
    "🐯",
    "🐮",
    "🐷",
    "🐸",
    "🐙",
    "🦋",
    "🐬",
    "🦜",
    "🦆",
    "🦉",
  ],
};

const EMOJI_GROUPS = [
  ["😀", "😂", "🤣", "😊", "😇", "🙂", "😉", "😍"],
  ["😎", "🤩", "😋", "😆", "😄", "🥰", "😘", "😗"],
  ["🤔", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄"],
  ["😳", "😱", "😨", "😰", "😢", "😥", "😭", "😫"],
];
const Chat = () => {
  const [selectedBubbleTheme, setSelectedBubbleTheme] = useState("Default");
  const [loading, setLoading] = useState(true);
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const { uid, displayName, profilePicUrl } = useGetUserInfo();
  const socket = useSocket();
  const { getMessages, getConversation } = useApi();

  const [conversation, setConversation] = useState(location.state?.userData || null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [isSenderTyping, setIsSenderTyping] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const emojiRef = useRef(null);
  const stickerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const readTimeoutRef = useRef(null);

  const isGroup = conversation?.kind === "group" || !!conversation?.isGroup;
  const { isDarkMode } = useContext(ThemeContext);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const [send, setSend] = useState(() => {
    const pref = localStorage.getItem("prefSend");
    return pref ? JSON.parse(pref) : { bg: "bg-blue-500", text: "text-white" };
  });
  const [recieve, setRecieve] = useState(() => {
    const pref = localStorage.getItem("prefRecieve");
    return pref ? JSON.parse(pref) : { bg: "bg-gray-800", text: "text-white" };
  });
  const [backdrop, setBackdrop] = useState(() => {
    const pref = localStorage.getItem("prefBackdrop");
    return pref ? JSON.parse(pref) : "url(https://i.pinimg.com/736x/b5/39/38/b5393867f0b5fcb64858afe1c918672d.jpg)";
  });

  const [isOpen, setIsOpen] = useState(false);
  const [selectedBackground, setSelectedBackground] = useState("Forest");

  const normalizeMsg = (m) => {
    const id = m.id !== undefined && m.id !== null ? String(m.id) : (m.clientMsgId ? String(m.clientMsgId) : "");
    const body = m.body !== undefined && m.body !== null ? m.body : (m.text || "");
    const kind = m.kind || m.type || "text";
    const createdAt = m.createdAt || m.timestamp || new Date().toISOString();
    return {
      ...m,
      id,
      body,
      text: body,
      kind,
      type: kind,
      createdAt,
      timestamp: createdAt,
      isModerated: Boolean(m.isModerated),
      moderationReason: m.moderationReason ?? null,
      senderId: m.senderId || (m.sender === displayName ? uid : null),
      sender: m.sender || { displayName: m.senderName || displayName || "User", avatarUrl: null },
      viewed: Boolean(m.viewed),
    };
  };

  // Fetch conversation metadata
  useEffect(() => {
    let mounted = true;
    if (roomId) {
      getConversation(roomId)
        .then((conv) => {
          if (mounted && conv) {
            setConversation((prev) => ({ ...prev, ...conv }));
          }
        })
        .catch((err) => console.error("Error fetching conversation details:", err));
    }
    return () => {
      mounted = false;
    };
  }, [roomId]);

  // Load initial messages
  useEffect(() => {
    let mounted = true;
    const loadInitial = async () => {
      setLoading(true);
      try {
        const res = await getMessages(roomId);
        if (mounted && res?.messages) {
          const norm = res.messages.map(normalizeMsg);
          setMessages(norm);
          setHasMore(Boolean(res.hasMore));
        }
      } catch (err) {
        console.error("Error fetching initial messages:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    if (roomId) {
      loadInitial();
    }
    return () => {
      mounted = false;
    };
  }, [roomId]);

  // Smart replies
  const turns = useMemo(
    () => toTurns(messages, (m) => m.senderId === uid || m.sender === displayName),
    [messages, uid, displayName]
  );
  const { replies: smartReplies, loading: smartRepliesLoading } =
    useSmartReplies(turns, { enabled: !loading });

  const setBubbleTheme = (sent, recieved) => {
    setSend(sent);
    localStorage.setItem("prefSend", JSON.stringify(sent));
    setRecieve(recieved);
    localStorage.setItem("prefRecieve", JSON.stringify(recieved));
  };

  const transitions = useTransition(messages, {
    keys: (message) => message.id || message.clientMsgId,
    from: (message) => ({
      opacity: 0,
      transform: `translateX(${message.senderId === uid || message.sender === displayName ? "50px" : "-50px"})`,
    }),
    enter: { opacity: 1, transform: "translateX(0px)" },
    leave: { opacity: 0, transform: "translateY(40px)" },
    config: { tension: 300, friction: 30 },
  });

  // Socket room join & listeners
  useEffect(() => {
    if (!socket || !roomId) return;

    socket.emit("join-conversation", { conversationId: roomId });

    const handleIncomingMessage = (rawMsg) => {
      if (rawMsg.conversationId && rawMsg.conversationId !== roomId) return;
      const incoming = normalizeMsg(rawMsg);
      setMessages((prev) => {
        if (incoming.clientMsgId) {
          const optIdx = prev.findIndex((m) => m.clientMsgId === incoming.clientMsgId);
          if (optIdx !== -1) {
            const next = [...prev];
            next[optIdx] = incoming;
            return next;
          }
        }
        const idIdx = prev.findIndex((m) => m.id === incoming.id);
        if (idIdx !== -1) {
          const next = [...prev];
          next[idIdx] = incoming;
          return next;
        }
        return [...prev, incoming];
      });
    };

    const handleReadReceipt = ({ conversationId }) => {
      if (conversationId !== roomId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.senderId === uid || m.sender === displayName) {
            return { ...m, viewed: true };
          }
          return m;
        })
      );
    };

    const handleTypingEvent = ({ conversationId, userId, isTyping }) => {
      if (conversationId === roomId && userId !== uid) {
        setIsSenderTyping(Boolean(isTyping));
      }
    };

    socket.on("message", handleIncomingMessage);
    socket.on("read", handleReadReceipt);
    socket.on("typing", handleTypingEvent);

    return () => {
      socket.off("message", handleIncomingMessage);
      socket.off("read", handleReadReceipt);
      socket.off("typing", handleTypingEvent);
    };
  }, [socket, socket?.connected, roomId, uid, displayName]);

  // Read receipts emit on incoming messages
  useEffect(() => {
    if (!socket || !roomId || messages.length === 0) return;
    const lastOtherMsg = [...messages]
      .reverse()
      .find((m) => m.senderId !== uid && m.sender !== displayName && m.id && !m.id.startsWith("opt_"));
    if (lastOtherMsg) {
      if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
      readTimeoutRef.current = setTimeout(() => {
        socket.emit("read", { conversationId: roomId, messageId: lastOtherMsg.id });
      }, 400);
    }
    return () => {
      if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
    };
  }, [messages, socket, roomId, uid, displayName]);

  // Scroll to bottom on initial load and incoming messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, isSenderTyping]);

  // Infinite scroll up pagination handler
  const handleScroll = async (e) => {
    const container = e.currentTarget;
    if (container.scrollTop < 40 && hasMore && !loadingMore && messages.length > 0) {
      setLoadingMore(true);
      const prevScrollHeight = container.scrollHeight;
      const oldestId = messages[0]?.id;
      try {
        const res = await getMessages(roomId, oldestId);
        if (res?.messages?.length) {
          const older = res.messages.map(normalizeMsg);
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const filtered = older.filter((m) => !existingIds.has(m.id));
            return [...filtered, ...prev];
          });
          setHasMore(Boolean(res.hasMore));
          requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight - prevScrollHeight;
          });
        } else {
          setHasMore(false);
        }
      } catch (err) {
        console.error("Error fetching older messages:", err);
      } finally {
        setLoadingMore(false);
      }
    }
  };

  // Dark mode
  useEffect(() => {
    const htmlElement = document.documentElement;
    if (isDarkMode) {
      htmlElement.classList.add("dark");
    } else {
      htmlElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  // Disable body scroll when chat is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  // Click outside to close emoji/sticker pickers
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiRef.current && !emojiRef.current.contains(event.target)) {
        setShowEmojis(false);
      }
      if (stickerRef.current && !stickerRef.current.contains(event.target)) {
        setShowStickers(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // IntersectionObserver for scroll-to-bottom button
  useEffect(() => {
    const container = messagesContainerRef.current;
    const endRef = messagesEndRef.current;
    if (!container || !endRef) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowScrollButton(!entry.isIntersecting);
      },
      { root: container, threshold: 0.8 }
    );
    observer.observe(endRef);
    return () => observer.disconnect();
  }, [messages]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  };

  const handleTyping = (e) => {
    if (socket && roomId) {
      socket.emit("typing", { conversationId: roomId, isTyping: true });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("typing", { conversationId: roomId, isTyping: false });
      }, 800);
    }
  };

  // Send message helper
  const sendMessageInternal = (content, kind = "text") => {
    if (!content || !content.trim()) return;
    const clientMsgId = crypto.randomUUID();
    const optimistic = normalizeMsg({
      id: `opt_${clientMsgId}`,
      clientMsgId,
      conversationId: roomId,
      senderId: uid,
      sender: { displayName: displayName || "Me", avatarUrl: profilePicUrl || null },
      kind,
      body: content,
      status: "sending",
      createdAt: new Date().toISOString(),
      viewed: false,
    });

    setMessages((prev) => [...prev, optimistic]);

    if (socket) {
      socket.emit(
        "send-message",
        {
          conversationId: roomId,
          clientMsgId,
          kind,
          body: content,
        },
        (ack) => {
          if (ack?.error) {
            setMessages((prev) =>
              prev.map((m) => (m.clientMsgId === clientMsgId ? { ...m, status: "failed" } : m))
            );
          } else if (ack?.ok && ack.message) {
            const normAck = normalizeMsg(ack.message);
            setMessages((prev) =>
              prev.map((m) => (m.clientMsgId === clientMsgId ? normAck : m))
            );
          }
        }
      );
    }

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.clientMsgId === clientMsgId && m.status === "sending" ? { ...m, status: "failed" } : m
        )
      );
    }, 5000);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    if (socket && roomId) {
      socket.emit("typing", { conversationId: roomId, isTyping: false });
    }
    sendMessageInternal(newMessage.trim(), "text");
    setNewMessage("");
  };

  const addEmoji = (emoji) => {
    setNewMessage((prev) => prev + emoji);
    setShowEmojis(false);
  };

  const sendSticker = (sticker) => {
    sendMessageInternal(sticker, "sticker");
    setShowStickers(false);
  };

  return (
    <div 
    style={{
      backgroundPosition: "center", // Centers the background image
      backgroundSize: "cover", // Ensures the image covers the entire container
      backgroundImage: "url(https://images.unsplash.com/photo-1590142035743-0ffa020065e6?q=80&w=2942&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)"
    }}
    className="min-h-[100dvh] sm:flex justify-center sm:items-center">
      <div className="relative h-[100dvh] width-screen sm:w-3xl sm:max-w-4xl flex flex-col h-[90vh] sm:h-[90vh] sm:mx-4 sm:my-4 bg-white sm:rounded-lg shadow-2xl overflow-hidden">
        {/* Chat Header */}
        <div className="bg-gray-200 shadow-3xl dark:bg-[#0A2239] p-4 flex items-center justify-between h-20">
          <div className="flex items-center">
            <ArrowLeft
              className="text-xl mr-1 text-black dark:text-white cursor-pointer hover:text-gray-400 transition-colors"
              onClick={() => navigate("/home")}
            />
            {isGroup ? (
              conversation?.avatarUrl || conversation?.groupPicUrl ? (
                <img
                  src={conversation.avatarUrl || conversation.groupPicUrl}
                  alt={conversation?.name}
                  className="w-12 h-12 sm:w-16 sm:h-16 rounded-full shadow-md object-cover"
                />
              ) : (
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full shadow-md bg-blue-500 text-white flex items-center justify-center text-2xl font-bold">
                  {conversation?.name?.[0]?.toUpperCase() || "#"}
                </div>
              )
            ) : (
              conversation?.avatarUrl || conversation?.profilePicUrl ? (
                <img
                  src={conversation.avatarUrl || conversation.profilePicUrl}
                  alt={conversation?.name}
                  className="cursor-pointer w-12 h-12 sm:w-16 sm:h-16 rounded-full shadow-md object-cover"
                />
              ) : (
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full shadow-md bg-blue-500 text-white flex items-center justify-center text-xl font-bold">
                  {conversation?.name?.[0]?.toUpperCase() || "U"}
                </div>
              )
            )}
            <div className="flex flex-col items-start">
              <h1 className="ml-3 text-lg sm:text-2xl font-bold text-black dark:text-white">
                {conversation?.name || "Chat"}
              </h1>

              <p className="ml-4 text-gray-500 dark:text-gray-300 text-xs">
                {isGroup
                  ? `${conversation?.members?.length || 0} members`
                  : conversation?.status || "Direct Message"}
              </p>
            </div>
          </div>
          <Toaster />
          <div className="flex flex-row sm:gap-6">
            <button className="hidden sm:block text-3xl dark:text-white cursor-pointer font-bold">
              <IoSearchSharp />
            </button>
            <button onClick={notify} className="hidden sm:block text-2xl cursor-pointer dark:text-white font-bold">
              <FaCamera />
            </button>
            <button onClick={() => navigate("/vc", { state: { conversationId: roomId, userData: conversation } })} className="block text-3xl dark:text-white cursor-pointer font-bold">
              <BiSolidVideo />
            </button>
            <div className="relative">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 cursor-pointer rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <MdOutlineMoreVert className="text-3xl text-gray-700 dark:text-gray-200" />
              </button>

              {isOpen && (
                <div className="overflow-y-auto absolute z-50 right-[-20px]  mt-1 w-80 rounded-xl shadow-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <div className="p-4 space-y-4">
                    {/* Background Section */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                        Chat Background
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        {backgrounds.map((bg) => (
                          <div
                            key={bg.name}
                            className={`
                      relative cursor-pointer transition-all duration-200
                      bg-white dark:bg-gray-800 
                      rounded-xl overflow-hidden
                      border-2 ${
                        selectedBackground === bg.name
                          ? "border-blue-500 dark:border-blue-400"
                          : "border-gray-200 dark:border-gray-700"
                      }
                      hover:shadow-lg transform hover:-translate-y-1
                    `}
                            onClick={() => {
                              setSelectedBackground(bg.name);
                              setBackdrop(bg.lightPreview);
                              localStorage.setItem("prefBackdrop", JSON.stringify(bg.lightPreview));
                            }}
                          >
                            <div className="p-3">
                              <div
                                className="h-16 w-full rounded-lg mb-2"
                                style={{
                                  background: `var(--mode-preview, ${bg.lightPreview})`,
                                }}
                              />
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                  {bg.name}
                                </p>
                                {selectedBackground === bg.name && (
                                  <MdCheck className="text-blue-500 text-xl" />
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bubble Theme Section */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Message Bubbles
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        {bubbleThemes.map((theme) => (
                          <div
                            key={theme.name}
                            className={`
                      relative cursor-pointer transition-all duration-200
                      bg-white dark:bg-gray-800 
                      rounded-xl overflow-hidden
                      border-2 ${
                        selectedBubbleTheme === theme.name
                          ? "border-blue-500 dark:border-blue-400"
                          : "border-gray-200 dark:border-gray-700"
                      }
                      hover:shadow-lg transform hover:-translate-y-1
                    `}
                            onClick={() => {
                              setSelectedBubbleTheme(theme.name);
                              setBubbleTheme(theme.sent, theme.received);
                            }}
                          >
                            <div className="p-3">
                              <div className="flex flex-col space-y-2 mb-2">
                                <div
                                  className={`${theme.received.bg} w-3/4 h-6 rounded-lg`}
                                />
                                <div
                                  className={`${theme.sent.bg} w-3/4 h-6 rounded-lg ml-auto`}
                                />
                              </div>
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                  {theme.name}
                                </p>
                                {selectedBubbleTheme === theme.name && (
                                  <MdCheck className="text-blue-500 text-xl" />
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Messages Container */}
        <div
          style={{
            backgroundImage: `${backdrop}`,
            backgroundPosition: "center",
            backgroundSize: "cover",
            height: "calc(100dvh - 140px)",
            msOverflowStyle: "none",
            scrollbarWidth: "none",
          }}
          className="flex-1 p-1 overflow-y-auto space-y-4"
        >
          {loading ? (
            <ChatSkeleton />
          ) : messages.length === 0 ? (
            <div 
              className="w-full h-full flex flex-col items-center justify-center text-gray-500"
              style={{ height: "calc(100dvh - 140px)" }}
            >
              <div className="flex flex-col items-center space-y-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-16 w-16 opacity-50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <p className="text-lg font-medium">No messages yet</p>
                <p className="text-sm">Start a conversation by sending a message!</p>
              </div>
            </div>
          ) : (
            <div
              style={{
                height: "calc(100dvh - 140px)",
                msOverflowStyle: "none",
                scrollbarWidth: "none",
              }}
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="overflow-y-auto flex-1 p-1 sm:p-6 space-y-1 w-full scroll-smooth [&::-webkit-scrollbar]:hidden"
            >
              {loadingMore && (
                <div className="text-center py-2 text-xs text-gray-400">Loading older messages...</div>
              )}
              {transitions((style, message) => {
                const isMine = message.senderId === uid || message.sender === displayName;
                return (
                  <animated.div
                    key={message.id || message.clientMsgId}
                    style={style}
                    className={`flex w-full px-1 py-1 sm:py-2 ${
                      isMine ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`
                        relative max-w-[70%] min-w-[140px] p-3 px-4 shadow-lg transition-all
                        ${
                          isMine
                            ? `${send.bg} rounded-2xl rounded-br-none ${send.text}`
                            : `${recieve.bg} rounded-2xl rounded-bl-none ${recieve.text}`
                        }
                        ${
                          message.type === "sticker" || message.kind === "sticker"
                            ? "text-4xl sm:text-6xl p-3"
                            : "text-md sm:text-base p-3"
                        }
                        transform hover:scale-[1.02]
                      `}
                    >
                      {message.isModerated || message.text === "Message hidden due to content moderation" || message.body === "Message hidden due to content moderation" ? (
                        <div className="space-y-0.5 py-0.5 select-none" title={message.moderationReason || undefined}>
                          {isMine ? (
                            <div>
                              <p className="font-semibold text-xs sm:text-sm">Message hidden</p>
                              <p className="text-[11px] sm:text-xs opacity-80">{message.moderationReason || "This message was removed by content moderation."}</p>
                            </div>
                          ) : (
                            <div>
                              <p className="italic text-xs sm:text-sm opacity-90">Message hidden due to content moderation</p>
                              {message.moderationReason && (
                                <p className="text-[11px] opacity-75">{message.moderationReason}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="break-words leading-relaxed">
                          {message.body || message.text}
                        </p>
                      )}
                      <div className="flex items-center justify-end gap-2 ">
                        <span className="text-[10px] sm:text-xs opacity-75">
                          {new Date(message.createdAt || message.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {isMine && (
                          <div className="flex items-center gap-0.5">
                            {message.status === "failed" ? (
                              <span className="text-red-400 text-[10px] font-semibold">Failed</span>
                            ) : message.status === "sending" ? (
                              <span className="text-gray-300 text-[10px]">Sending...</span>
                            ) : (
                              <CheckCheck
                                className={`w-4 h-4 ${
                                  message.viewed
                                    ? "text-blue-400"
                                    : "text-gray-400"
                                }`}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </animated.div>
                );
              })}
              {isSenderTyping && (
                <div className="flex w-full px-4 py-2 justify-start">
                  <div
                    className="
                      relative max-w-[70%] p-4 px-4 shadow-lg transition-all
                      bg-[#132E32] rounded-2xl rounded-bl-none
                      text-sm sm:text-base
                      transform hover:scale-[1.02]
                    "
                  >
                    <div className="text-white">
                      <div className="flex flex-row gap-1">
                        <div className="w-2 h-2 rounded-full bg-gray-200 animate-bounce [animation-delay:.7s]"></div>
                        <div className="w-2 h-2 rounded-full bg-gray-200 animate-bounce [animation-delay:.3s]"></div>
                        <div className="w-2 h-2 rounded-full bg-gray-200 animate-bounce [animation-delay:.7s]"></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} className="h-10 w-full" />
            </div>
          )}
        </div>
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="cursor-pointer fixed bottom-20 sm:bottom-30 sm:left-90 left-5 bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full shadow-lg 
    transform hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center"
            aria-label="Scroll to bottom"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </button>
        )}
        {/* Input Form */}
        <div className="relative">
          {/* Emoji Picker */}
          {showEmojis && (
            <div
              ref={emojiRef}
              className="absolute bottom-full right-16 mb-2 bg-white rounded-lg shadow-lg p-4 border"
            >
              <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto">
                {EMOJI_GROUPS.flat().map((emoji, index) => (
                  <button
                    key={index}
                    onClick={() => addEmoji(emoji)}
                    className="text-2xl hover:bg-gray-100 p-1 rounded transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sticker Picker */}
          {showStickers && (
            <div
              ref={stickerRef}
              className="absolute bottom-full right-16 mb-2 bg-white rounded-lg shadow-lg p-4 border"
            >
              <div className="space-y-4">
                {Object.entries(STICKER_PACKS).map(([pack, stickers]) => (
                  <div key={pack}>
                    <h3 className="text-sm font-semibold mb-2 capitalize">
                      {pack}
                    </h3>
                    <div className="grid grid-cols-8 gap-2">
                      {stickers.map((sticker, index) => (
                        <button
                          key={index}
                          onClick={() => sendSticker(sticker)}
                          className="text-2xl hover:bg-gray-100 p-1 rounded transition-colors"
                        >
                          {sticker}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <SmartReplyChips
            replies={smartReplies}
            loading={smartRepliesLoading}
            onPick={(text) => {
              setNewMessage(text);
              inputRef.current?.focus();
            }}
          />

          <form
            onSubmit={handleSubmit}
            className="bg-gray-50 shadow-3xl h-15 dark:bg-[#0A2239] px-3 flex items-center gap-2 text-black dark:text-white shadow-sm focus-within:border-blue-500 transition-colors" // Added focus-within styling
          >
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                handleTyping(e);
              }}
              placeholder="Type a message..."
              className="flex-1 text-gray-800 dark:text-gray-200 min-w-[100px] px-4 py-2 rounded-full border border-gray-200 dark:border-gray-500 focus:outline-none focus:ring-0 focus:border-blue-500 transition-colors" // Improved input styling
            />

            <div className="flex items-center space-x-2">
              {" "}
              {/* Grouped emoji/sticker buttons */}
              <button
                type="button"
                onClick={() => {
                  setShowEmojis(!showEmojis);
                  setShowStickers(false);
                }}
                className="cursor-pointer text-gray-800 dark:text-gray-200 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <BsEmojiGrin className="w-5.5 h-5.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowStickers(!showStickers);
                  setShowEmojis(false);
                }}
                className="cursor-pointer text-gray-800 dark:text-gray-200 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <PiStickerBold className="w-6.5 h-6.5" />
              </button>
              <button
                type="submit"
                className="cursor-pointer bg-blue-500 text-white rounded-full p-2 hover:bg-blue-600 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed" // Added disabled styling
                disabled={!newMessage.trim() || loading}
              >
                <RiSendPlaneFill className="mr-1 mt-1 w-6 h-6" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Chat;
