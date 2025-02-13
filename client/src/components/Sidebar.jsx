import { useState } from "react";
import { MessageCircle } from 'lucide-react';

export const Sidebar=({isLoading,users,notif,notifications, displayName,onlineUsers, groups, handleJoinRoom, registeredUsers })=> {

  return (
    <div 
  className={`h-screen bg-white dark:bg-gray-900 shadow-lg w-full sm:w-100 transition-all duration-300 flex flex-col`}
>
  <div className="overflow-y-auto flex-1 p-3">
<div
  class="mt-5 mb-5 dark:bg-gray-900 sm:hidden flex items-center border w-full dark:focus-within:border-gray-500 focus-within:border-indigo-500 transition duration-300 pr-3 gap-2 bg-white border-gray-500/30 h-[46px] rounded-[10px] overflow-hidden"
>
  <input
    type="text"
    placeholder="Search for People"
    class="w-full dark:text-white h-full pl-4 outline-none placeholder-gray-500 text-sm"
  />
  <svg
    xmlns="http://www.w3.org/2000/svg"
    x="0px"
    y="0px"
    width="22"
    height="22"
    viewBox="0 0 30 30"
    fill="#6B7280"
  >
    <path
      d="M 13 3 C 7.4889971 3 3 7.4889971 3 13 C 3 18.511003 7.4889971 23 13 23 C 15.396508 23 17.597385 22.148986 19.322266 20.736328 L 25.292969 26.707031 A 1.0001 1.0001 0 1 0 26.707031 25.292969 L 20.736328 19.322266 C 22.148986 17.597385 23 15.396508 23 13 C 23 7.4889971 18.511003 3 13 3 z M 13 5 C 17.430123 5 21 8.5698774 21 13 C 21 17.430123 17.430123 21 13 21 C 8.5698774 21 5 17.430123 5 13 C 5 8.5698774 8.5698774 5 13 5 z"
    ></path>
  </svg>
</div>


    {/* Online Users Section */}
    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
      Online Users
    </h3>
    <div className="space-y-3">
      {onlineUsers.length===0?(
        <>
        <div class="dark:hidden flex flex-row gap-2">
  <div class="animate-pulse bg-gray-300 w-14 h-14 rounded-lg"></div>
  <div class="flex flex-col gap-2">
    <div class="animate-pulse bg-gray-300 w-28 h-5 rounded-lg"></div>
    <div class="animate-pulse bg-gray-300 w-36 h-3 rounded-lg"></div>
    <div class="animate-pulse bg-gray-300 w-36 h-2 rounded-lg"></div>
  </div>
</div>
       <div class="hidden dark:flex items-center space-x-2">
  <div class="animate-pulse rounded-full bg-gray-500 h-12 w-12 rounded-full"></div>
  <div class="space-y-2">
    <div class="animate-pulse rounded-md bg-gray-500 h-4 w-[200px]"> </div>
    <div class="animate-pulse rounded-md bg-gray-500 h-4 w-[170px]"> </div>
  </div>
</div>
      </>
        ):(
        <>
         {onlineUsers.map((user) => (
        <div
          key={user.id}
          onClick={() => handleJoinRoom(user)}
          className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <img 
                src={user.profilePicUrl || "/api/placeholder/40/40"} 
                alt={user.name} 
                className="w-12 h-12 rounded-full object-cover"
              />
              {user.isOnline === "online" && (
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full"></span>
              )}
              {/* Display notification badge only if the username matches */}
              {notif && notifications[user.name] > 0 && (
                <span className="absolute top-0 left-7 dark:text-black font-bold dark:bg-[#A5C5E9] bg-red-500 text-white text-xs rounded-full px-1">
                  {notifications[user.name]}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                {user.name}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {user.status || "Available"}
              </span>
            </div>
          </div>
          
          <button className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-700 rounded-full transition-colors">
            <MessageCircle size={20} />
          </button>
        </div>
      ))}
      </>
        )}
     
    </div>

    {/* Groups Section */}
    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-2">
      Your Chats
    </h3>
    <div className="space-y-3">
      {groups.map((group) => (
        <div
          key={group.id}
          onClick={() => handleJoinRoom(group)}
          className="flex items-center gap-3 p-3 bg-blue-100 dark:bg-blue-900 rounded-lg cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800 transition"
        >
          <div className="w-10 h-10 bg-blue-500 text-white flex items-center justify-center rounded-full">
            {group.name[0]}
          </div>
          <span className="text-gray-800 dark:text-gray-200 font-medium">
            {group.name}
          </span>
        </div>
      ))}
      {isLoading?(<>
<div class="flex flex-row gap-2">
  <div class="animate-pulse bg-gray-300 w-14 h-14 rounded-lg"></div>
  <div class="flex flex-col gap-2">
    <div class="animate-pulse bg-gray-300 w-28 h-5 rounded-lg"></div>
    <div class="animate-pulse bg-gray-300 w-36 h-3 rounded-lg"></div>
    <div class="animate-pulse bg-gray-300 w-36 h-2 rounded-lg"></div>
  </div>
</div>
</>):(
        <>
        {users.sort().map((user)=>{
        if(user.displayName===displayName || onlineUsers.find(u=>u.name===user.displayName))
        {
          return null
        }
        return(<div
          key={user.id}
          onClick={() => handleJoinRoom({...user, name: user.displayName})}
          className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <img 
                src={user.profilePicUrl || 0} 
                alt={user.displayName} 
                className="w-12 h-12 rounded-full object-cover "
              />
              {/* Display notification badge only if the username matches */}
              {notif && notifications[user.displayName] > 0 && (
                <span className="absolute top-0 left-7 bg-red-500 text-white text-xs rounded-full px-1">
                  {notifications[user.displayName]}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                {user.displayName}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {user.status || "Available"}
              </span>
            </div>
          </div>
          
          <button className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-700 rounded-full transition-colors">
            <MessageCircle size={20} />
          </button>
        </div>
      )})}</>)}
      
    </div>
  </div>
</div>

  );
}
