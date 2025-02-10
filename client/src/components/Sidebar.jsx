import { useState } from "react";
import { MessageCircle } from 'lucide-react';

export const Sidebar=({ onlineUsers, groups, handleJoinRoom, registeredUsers })=> {
  console.log(onlineUsers)

  return (
    <div 
 
    className={`h-[90vh] bg-white shadow-lg w-full sm:w-100 transition-all duration-300 flex flex-col`}>
      

      <div className="overflow-y-auto flex-1 p-3">
        {/* Online Users Section */}
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Online Users</h3>
          <div className="space-y-3">
            {onlineUsers.map((user) => (
              <div
              key={user.id}
              onClick={() => handleJoinRoom(user)}
              className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl 
                         hover:border-gray-200 hover:shadow-sm transition-all duration-200 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img 
                    src={user.profilePicUrl || "/api/placeholder/40/40"} 
                    alt={user.name} 
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-white"
                  />
                  {user.isOnline==="online" && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-white rounded-full"></span>}
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-900 font-medium">{user.name}</span>
                  <span className="text-sm text-gray-500">
                    {user.status || "Available"}
                  </span>
                </div>
              </div>
              
              <button className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
                <MessageCircle size={20} />
              </button>
            </div>
          ))}
        </div>
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Other Users</h3>
          <div className="space-y-3">
            {registeredUsers.map((user) => {
              if(onlineUsers.some(person => person.displayName === user.name)){ return };
              return(
              <div
              key={user.id}
              onClick={() => handleJoinRoom(user)}
              className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl 
                         hover:border-gray-200 hover:shadow-sm transition-all duration-200 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img 
                    src={user.profilePicUrl || "/api/placeholder/40/40"} 
                    alt={user.name} 
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-white"
                  />
                  {user.isOnline==="online" && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-white rounded-full"></span>}
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-900 font-medium">{user.displayName}</span>
                  <span className="text-sm text-gray-500">
                    {user.status || "Available"}
                  </span>
                </div>
              </div>
              
              <button className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
                <MessageCircle size={20} />
              </button>
            </div>
          )})}
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
