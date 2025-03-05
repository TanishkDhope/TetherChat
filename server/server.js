import express from "express";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import { Server } from "socket.io";
import {nanoid} from "nanoid"


dotenv.config();

const app = express();
const server = http.createServer(app);
let onlineUsers = [];
let rooms = [];
let firstUser = null; // Stores the first connected user
let offers=[];


const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());

io.on("connection", (socket) => {
  socket.emit("connection", { socketId: socket.id });
  console.log("A user connected with socket ID:", socket.id);


  //USER LOGIC

  socket.on("join", ({ displayName, profilePicUrl, status, isOnline }) => {
    if (onlineUsers.find((user) => user.name === displayName)) {
      console.log("User already exists:", displayName);
      onlineUsers = onlineUsers.map((user) =>
        user.name == displayName
          ? { id: socket.id, name: displayName, profilePicUrl, status, isOnline }
          : user
      );
      io.emit("onlineUsers", onlineUsers);
      return;
    }
    onlineUsers.push({ id: socket.id, name: displayName, profilePicUrl, status, isOnline });
      ("User joined:", displayName);
    io.emit("onlineUsers", onlineUsers);
  });

  //ROOM JOIN LOGIC

  socket.on("requestJoin", ({ from, to, roomId }) => {
    socket.to(to).emit("requestJoin", { from, roomId });
  });

  //GROUP CREATION LOGIC
  socket.on("createGroup", (data) => {
    const group = {
      id: nanoid(),
      name: data.groupName,
      users: data.users,
    };
    socket.emit("groupCreated", group);
  });

  socket.on("deleteGroup", (groupId) => {
    
  });


  
  socket.on("joinRoom", (roomId, displayName) => {
    socket.join(roomId);
  
    // Find the room or create a new one if it doesn't exist
    let room = rooms.find((room) => room?.id === roomId);
    if (!room) {
      room = { id: roomId, users: [] };
      rooms.push(room);
    }
  
    // Check if the user is already in the room
    const existingUser = room?.users.find((user) => user.name === displayName);
  
    if (existingUser) {
      // If the user exists, update their socket ID
      existingUser.id = socket.id;
    } else {
      // If the user doesn't exist, add them to the room
      const onlineUser = onlineUsers.find((user) => user.id === socket.id);
      if (onlineUser) {
        room.users.push({
          id: socket.id,
          name: onlineUser.name,
          profilePicUrl: onlineUser.profilePicUrl,
        });
      }
    }
  
  
  });

  socket.on("leaveRoom", (roomId, displayName) => {
    socket.leave(roomId);
    
    rooms = rooms.map(room => {
      if (room?.id === roomId) {
        return {
          ...room,
          users: room.users.filter(user => user.name !== displayName)
        };
      }
    })
      // Remove empty rooms
      rooms = rooms.filter((room) => room?.users.length > 0);

    
  });

  socket.on("get-room-info", (roomId) => {
    socket.emit("room-info", rooms.find((room) => room?.id === roomId));
  });

  socket.on("get-user-details", (name) => {
    socket.emit("user-details", onlineUsers.find((user) => user.name === name));
  });

  socket.on("get-user-notif", (name,message)=>{
    socket.emit("user-notif", onlineUsers.find((user) => user.name === name) || "", message);
  });

  socket.on("message-notif", (message, userId, username,roomId)=>{
    socket.to(userId).emit("message-notif", message,username, roomId);
  })

  socket.on("update-room-info", (roomId)=>{
    socket.to(roomId).emit("room-info", rooms.find((room) => room?.id === roomId));
  })
  //MESSAGES LOGIC  
  socket.on("send-message", (message, roomId) => {
    socket.to(roomId).emit("recieve-message", message);
  })

  socket.on("disconnect", () => {
    onlineUsers = onlineUsers.filter((user) => user.id !== socket.id);
    console.log("A user disconnected with socket ID:", socket.id);
    io.emit("onlineUsers", onlineUsers);

    
    if (socket.id === firstUser) {
      firstUser = null;
  }

  socket.broadcast.emit("hangup"); // End call if user disconnects
  });


  socket.on("typing", (state , roomId)=>{
    socket.to(roomId).emit("IsSenderTyping", state);
  })

 

  // If an offer exists, send it to the new user
  if (offers.length > 0) {
    socket.emit("offer", offers[0]);
}

if (!firstUser) {
    firstUser = socket.id;
} else {
    io.to(firstUser).emit("ready"); // Notify first user
    io.to(socket.id).emit("ready"); // Notify second user
}

socket.on("offer", (offer) => {
    offers.push(offer);
    socket.broadcast.emit("offer", offer);
});

socket.on("answer", (answer) => {
    socket.broadcast.emit("answer", answer);
});

socket.on("ice-candidate", (candidate) => {
    socket.broadcast.emit("ice-candidate", candidate);
});

// Handle hangup event
socket.on("hangup", () => {
    console.log("Call ended by:", socket.id);
    socket.broadcast.emit("hangup"); // Notify other peer
    offers = []; // Clear offers after hangup
});



});
app.get("/", (req, res) => {
  res.send("Hello World!");
});

server.listen(process.env.PORT || 5000, () => {
  console.log(`Server is running on port ${process.env.PORT || 5000}`);
});
