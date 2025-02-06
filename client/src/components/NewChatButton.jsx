import React, { useState } from 'react';

const NewChatButton= () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [chats, setChats] = useState([]);

  const onlineUsers = ['Alice', 'Bob', 'Charlie', 'Diana'];

  const handleUserSelect = (user) => {
    setChats((prevChats) => [...prevChats, user]);
    setIsModalOpen(false);
  };

  return (
    <div className="p-4">
      {/* Group Cards Container */}
      <div id="group-cards" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {chats.map((user, index) => (
          <div key={index} className="border rounded-lg shadow-md p-4 bg-white">
            <h3 className="text-xl font-semibold">{user}</h3>
            <p className="text-gray-600">Start chatting with {user}!</p>
          </div>
        ))}
      </div>

     

      
    </div>
  );
};

export default NewChatButton;
