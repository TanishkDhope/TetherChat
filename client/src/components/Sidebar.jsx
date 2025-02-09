import { useState } from "react";

export const Sidebar=({ onlineUsers, groups, handleJoinRoom })=> {

  return (
    <div 
 
    className={`h-screen bg-white shadow-lg w-full sm:w-100 transition-all duration-300 flex flex-col`}>
      

      <div className="overflow-y-auto flex-1 p-3">
        {/* Online Users Section */}
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Online Users</h3>
        <div className="space-y-3">
          {onlineUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition"
              onClick={() => handleJoinRoom(user)}
            >
              <img src={user.profilePicUrl || "https://i.pravatar.cc/100"} alt={user.name} className="w-10 h-10 rounded-full" />
             <span className="text-gray-800 font-medium">{user.name}</span>
            </div>
          ))}
        </div>

        {/* Groups Section */}
        <h3 className="text-lg font-semibold text-gray-700 mt-4 mb-2">Groups</h3>
        <div className="space-y-3">
          {groups.map((group) => (
            <div
              key={group.id}
              className="flex items-center gap-3 p-3 bg-blue-100 rounded-lg cursor-pointer hover:bg-blue-200 transition"
              onClick={() => handleJoinRoom(group)}
            >
              <div className="w-10 h-10 bg-blue-500 text-white flex items-center justify-center rounded-full">
                {group.name[0]}
              </div>
             <span className="text-gray-800 font-medium">{group.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
