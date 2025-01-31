import express from "express";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import { Server } from "socket.io";

dotenv.config();

const app = express();
const server = http.createServer(app);
let onlineUsers = [];

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

    socket.on("join", (displayName) => {
      onlineUsers.push({ id: socket.id, name: displayName }); 
      console.log("User joined:", displayName);
      io.emit("onlineUsers", onlineUsers); 
    });


    socket.on("disconnect", () => {
       onlineUsers = onlineUsers.filter((user) => user.id !== socket.id); 
    console.log("A user disconnected. Remaining users:", onlineUsers);
    io.emit("onlineUsers", onlineUsers); 
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log(`Server is running on port ${process.env.PORT || 3000}`);
});
