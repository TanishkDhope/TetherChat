import { MessageCircle, UserPlus, Check, X, Clock } from 'lucide-react'

export const Sidebar = ({
  isLoading,
  notif,
  notifications,
  displayName,
  email,
  onlineUsers,
  groups,
  friends = [],
  friendEmails = [],
  sentRequests = [],
  friendRequests = [],
  handleJoinRoom,
  handleJoinGroup,
  handleSendFriendRequest,
  handleAcceptFriend,
  handleDeclineFriend,
}) => {
  const isFriend = (userEmail) => userEmail && friendEmails.includes(userEmail);
  const isRequested = (userEmail) => userEmail && sentRequests.includes(userEmail);
  const isSelf = (user) =>
    (email && user.email === email) || user.name === displayName;

  return (
    <div
      className={`h-full bg-white dark:bg-gray-900 shadow-lg w-full sm:w-100 transition-all duration-300 flex flex-col`}
    >
      <div className="flex-1 p-3 overflow-y-auto">
        <div
          className="mt-5 mb-5 dark:bg-gray-900 sm:hidden flex items-center border w-full dark:focus-within:border-gray-500 focus-within:border-indigo-500 transition duration-300 pr-3 gap-2 bg-white border-gray-500/30 h-[46px] rounded-[10px] overflow-hidden"
        >
          <input
            type="text"
            placeholder="Search for People"
            className="w-full dark:text-white h-full pl-4 outline-none placeholder-gray-500 text-sm"
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

        {/* Friend Requests Section */}
        {friendRequests.length > 0 && (
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Friend Requests ({friendRequests.length})
            </h3>
            <div className="space-y-3">
              {friendRequests.map((req) => (
                <div
                  key={req.email}
                  className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={req.profilePicUrl}
                      alt={req.displayName}
                      className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-gray-900 dark:text-gray-100 font-medium truncate">
                        {req.displayName}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        wants to be friends
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleAcceptFriend(req)}
                      title="Accept"
                      className="p-2 cursor-pointer text-green-600 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-full transition-colors"
                    >
                      <Check size={18} />
                    </button>
                    <button
                      onClick={() => handleDeclineFriend(req)}
                      title="Decline"
                      className="p-2 cursor-pointer text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-full transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Online Users Section */}
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Online Users
        </h3>
        <div className="space-y-3">
          {onlineUsers.length === 0 ? (
            <>
              <div className="dark:hidden flex flex-row gap-2">
                <div className="animate-pulse bg-gray-300 w-14 h-14 rounded-lg"></div>
                <div className="flex flex-col gap-2">
                  <div className="animate-pulse bg-gray-300 w-28 h-5 rounded-lg"></div>
                  <div className="animate-pulse bg-gray-300 w-36 h-3 rounded-lg"></div>
                  <div className="animate-pulse bg-gray-300 w-36 h-2 rounded-lg"></div>
                </div>
              </div>
              <div className="hidden dark:flex items-center space-x-2">
                <div className="animate-pulse rounded-full bg-gray-500 h-12 w-12"></div>
                <div className="space-y-2">
                  <div className="animate-pulse rounded-md bg-gray-500 h-4 w-[200px]"> </div>
                  <div className="animate-pulse rounded-md bg-gray-500 h-4 w-[170px]"> </div>
                </div>
              </div>
            </>
          ) : (
            [...onlineUsers]
              .sort((a, b) => {
                if (a.name === displayName) return -1;
                if (b.name === displayName) return 1;
                return a.name.localeCompare(b.name);
              })
              .map((user) => {
                const self = isSelf(user);
                const friend = isFriend(user.email);
                const requested = isRequested(user.email);
                return (
                  <div
                    key={user.id}
                    onClick={() => (friend || self) && handleJoinRoom(user)}
                    className={`flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl transition-all duration-200 ${
                      friend || self
                        ? "hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm cursor-pointer"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative flex-shrink-0">
                        <img
                          src={user.profilePicUrl || "/api/placeholder/40/40"}
                          alt={user.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                        {user.isOnline === "online" && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full"></span>
                        )}
                        {notif && notifications[user.name] > 0 && (
                          <span className="absolute top-0 left-7 dark:text-black font-bold dark:bg-[#A5C5E9] bg-red-500 text-white text-xs rounded-full px-1">
                            {notifications[user.name]}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-gray-900 dark:text-gray-100 font-medium truncate">
                          {self ? "You" : user.name}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {user.status || "Available"}
                        </span>
                      </div>
                    </div>

                    {/* Action: message (friend/self), requested, or add friend */}
                    {self ? null : friend ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJoinRoom(user);
                        }}
                        title="Message"
                        className="p-2 cursor-pointer text-gray-400 dark:hover:text-indigo-200 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-700 rounded-full transition-colors flex-shrink-0"
                      >
                        <MessageCircle size={20} />
                      </button>
                    ) : requested ? (
                      <span
                        title="Request sent"
                        className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 flex-shrink-0"
                      >
                        <Clock size={16} /> Requested
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSendFriendRequest(user);
                        }}
                        title="Add friend"
                        className="flex items-center gap-1 px-3 py-1.5 cursor-pointer text-sm text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 rounded-full transition-colors flex-shrink-0"
                      >
                        <UserPlus size={16} /> Add
                      </button>
                    )}
                  </div>
                );
              })
          )}
        </div>

        {/* Groups Section */}
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-2">
          Your Groups
        </h3>
        <div className="space-y-3">
          {groups.length === 0 && !isLoading && (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No groups yet.
            </p>
          )}
          {groups.map((group) => (
            <div
              key={group.id}
              onClick={() => handleJoinGroup(group)}
              className="flex items-center gap-3 p-3 bg-blue-100 dark:bg-blue-900 rounded-lg cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800 transition"
            >
              {group.groupPicUrl ? (
                <img
                  src={group.groupPicUrl}
                  alt={group.name}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 bg-blue-500 text-white flex items-center justify-center rounded-full">
                  {group.name[0]}
                </div>
              )}
              <span className="text-gray-800 dark:text-gray-200 font-medium">
                {group.name}
              </span>
            </div>
          ))}
        </div>

        {/* Friends Section (offline friends; online ones show above) */}
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-2">
          Friends
        </h3>
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex flex-row gap-2">
              <div className="animate-pulse bg-gray-300 w-14 h-14 rounded-lg"></div>
              <div className="flex flex-col gap-2">
                <div className="animate-pulse bg-gray-300 w-28 h-5 rounded-lg"></div>
                <div className="animate-pulse bg-gray-300 w-36 h-3 rounded-lg"></div>
                <div className="animate-pulse bg-gray-300 w-36 h-2 rounded-lg"></div>
              </div>
            </div>
          ) : friends.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No friends yet. Add people from the Online Users list above.
            </p>
          ) : (
            friends
              .filter(
                (friend) =>
                  !onlineUsers.some(
                    (u) => u.email === friend.email || u.name === friend.displayName
                  )
              )
              .map((friend) => (
                <div
                  key={friend.email}
                  onClick={() =>
                    handleJoinRoom({ ...friend, name: friend.displayName })
                  }
                  className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm transition-all duration-200 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex-shrink-0">
                      <img
                        src={friend.profilePicUrl}
                        alt={friend.displayName}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      {notif && notifications[friend.displayName] > 0 && (
                        <span className="absolute top-0 left-7 bg-red-500 text-white text-xs rounded-full px-1">
                          {notifications[friend.displayName]}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-gray-900 dark:text-gray-100 font-medium truncate">
                        {friend.displayName}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        Offline
                      </span>
                    </div>
                  </div>
                  <button className="p-2 cursor-pointer text-gray-400 dark:hover:text-indigo-200 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-700 rounded-full transition-colors flex-shrink-0">
                    <MessageCircle size={20} />
                  </button>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
};
