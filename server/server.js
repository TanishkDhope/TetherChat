import express from "express";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import { Server } from "socket.io";

dotenv.config();

const app = express();
const server = http.createServer(app);
let onlineUsers = [];
let rooms = [];

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

  socket.on("join", ({ displayName, profilePicUrl }) => {
    if (onlineUsers.find((user) => user.name === displayName)) {
      console.log("User already exists:", displayName);
      onlineUsers = onlineUsers.map((user) =>
        user.name == displayName
          ? { id: socket.id, name: displayName, profilePicUrl }
          : user
      );
      io.emit("onlineUsers", onlineUsers);
      return;
    }
    onlineUsers.push({ id: socket.id, name: displayName, profilePicUrl });
    console.log("User joined:", displayName);
    io.emit("onlineUsers", onlineUsers);
  });

  //ROOM JOIN LOGIC

  socket.on("requestJoin", ({ from, to, roomId }) => {
    socket.to(to).emit("requestJoin", { from, roomId });
  });


  
  socket.on("joinRoom", (roomId, displayName) => {
    socket.join(roomId);
  
    // Find the room or create a new one if it doesn't exist
    let room = rooms.find((room) => room.id === roomId);
    if (!room) {
      room = { id: roomId, users: [] };
      rooms.push(room);
    }
  
    // Check if the user is already in the room
    const existingUser = room.users.find((user) => user.name === displayName);
  
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
  
    // Remove empty rooms
    rooms = rooms.filter((room) => room.users.length > 0);
  });

  socket.on("leaveRoom", (roomId, socketId) => {
    rooms.find((room) => room.id === roomId).users = rooms.find((room) => room.id === roomId).users.filter(
      (user) => user.id !== socketId
    );
    console.log(rooms)
  })

  socket.on("get-room-info", (roomId) => {
    socket.emit("room-info", rooms.find((room) => room.id === roomId));
  });

  //MESSAGES LOGIC  
  socket.on("send-message", (message, roomId) => {
    socket.to(roomId).emit("recieve-message", message);
  })

  socket.on("disconnect", () => {
    onlineUsers = onlineUsers.filter((user) => user.id !== socket.id);
    console.log("A user disconnected with socket ID:", socket.id);
    io.emit("onlineUsers", onlineUsers);
  });
});

server.listen(process.env.PORT || 5000, () => {
  console.log(`Server is running on port ${process.env.PORT || 3000}`);
});
