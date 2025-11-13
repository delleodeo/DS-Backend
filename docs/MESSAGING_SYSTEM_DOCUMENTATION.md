# Real-Time Messaging System - Frontend Integration Guide

## Overview
Complete real-time messaging system for customer-vendor communication using Socket.IO and REST API. Features include:
- 💬 Real-time message delivery
- 📬 Unread message tracking
- ✍️ Typing indicators
- 🔔 Read receipts
- 🖼️ Image messages support
- 📦 Product/Order references
- 🔍 Conversation search
- 🗄️ Archive & block functionality

---

## Setup

### 1. Install Socket.IO Client
```bash
npm install socket.io-client
# or
yarn add socket.io-client
```

### 2. Socket.IO Connection Setup
```javascript
// src/utils/socket.js
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001'; // Your backend URL
const token = localStorage.getItem('authToken');

export const socket = io(SOCKET_URL, {
  auth: {
    token: token
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});

// Connection events
socket.on('connect', () => {
  console.log('✅ Socket connected:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('❌ Socket disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
});

export default socket;
```

---

## REST API Endpoints

### Base URL
```
http://localhost:3001/v1/messages
```

### Authentication
All endpoints require JWT token:
```javascript
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

---

## API Reference

### 1. Get or Create Conversation
**POST** `/messages/conversation`

Start a new conversation or get existing one with a vendor.

**Body:**
```json
{
  "vendorId": "68f487cd98a695b5db60e55d",
  "contextType": "general",
  "contextId": null
}
```

**Context Types:**
- `general` - Regular conversation
- `product` - About a specific product (include productId in contextId)
- `order` - About an order (include orderId in contextId)

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "691abc123def456789012345",
    "customerId": "68f123456789abcdef012345",
    "vendorId": "68f487cd98a695b5db60e55d",
    "unreadCountCustomer": 0,
    "unreadCountVendor": 0,
    "createdAt": "2025-11-13T10:00:00.000Z",
    "updatedAt": "2025-11-13T10:00:00.000Z"
  }
}
```

**Example:**
```javascript
const startConversation = async (vendorId) => {
  try {
    const response = await fetch('http://localhost:3001/v1/messages/conversation', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vendorId: vendorId,
        contextType: 'general'
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Conversation:', data.data);
      // Join Socket.IO room
      socket.emit('join_conversation', data.data._id);
      return data.data;
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

### 2. Get User Conversations
**GET** `/messages/conversations?userType=customer&page=1&limit=20`

Get all conversations for the authenticated user.

**Query Parameters:**
- `userType` - `customer` or `vendor`
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "_id": "691abc123def456789012345",
        "customerId": {
          "_id": "68f123456789abcdef012345",
          "name": "John Doe",
          "imageUrl": "https://example.com/avatar.jpg",
          "email": "john@example.com"
        },
        "vendorId": {
          "_id": "68f487cd98a695b5db60e55d",
          "name": "Tech Store",
          "imageUrl": "https://example.com/store.jpg",
          "email": "store@example.com"
        },
        "lastMessage": {
          "content": "Thank you for your order!",
          "senderId": "68f487cd98a695b5db60e55d",
          "senderType": "vendor",
          "createdAt": "2025-11-13T10:30:00.000Z"
        },
        "unreadCountCustomer": 2,
        "unreadCountVendor": 0,
        "updatedAt": "2025-11-13T10:30:00.000Z"
      }
    ],
    "total": 15,
    "page": 1,
    "totalPages": 1,
    "hasMore": false
  }
}
```

**Example:**
```javascript
const getConversations = async (userType = 'customer') => {
  try {
    const response = await fetch(
      `http://localhost:3001/v1/messages/conversations?userType=${userType}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    const data = await response.json();
    
    if (data.success) {
      return data.data.conversations;
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

### 3. Get Conversation Messages
**GET** `/messages/conversation/:conversationId/messages?page=1&limit=50`

Get all messages in a conversation.

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Messages per page (default: 50)

**Response:**
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "_id": "692msg123456789012345678",
        "conversationId": "691abc123def456789012345",
        "senderId": {
          "_id": "68f123456789abcdef012345",
          "name": "John Doe",
          "imageUrl": "https://example.com/avatar.jpg"
        },
        "senderType": "customer",
        "content": "Hello, I have a question about this product",
        "messageType": "text",
        "isRead": true,
        "readAt": "2025-11-13T10:15:00.000Z",
        "createdAt": "2025-11-13T10:00:00.000Z"
      }
    ],
    "total": 25,
    "page": 1,
    "totalPages": 1,
    "hasMore": false
  }
}
```

**Example:**
```javascript
const getMessages = async (conversationId) => {
  try {
    const response = await fetch(
      `http://localhost:3001/v1/messages/conversation/${conversationId}/messages`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    const data = await response.json();
    
    if (data.success) {
      return data.data.messages;
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

### 4. Send Message (REST API)
**POST** `/messages/send`

Send a message via REST API (also available via Socket.IO for real-time).

**Body:**
```json
{
  "conversationId": "691abc123def456789012345",
  "content": "Hello! I'm interested in this product.",
  "messageType": "text",
  "imageUrl": null,
  "referenceId": null,
  "referenceType": null
}
```

**Message Types:**
- `text` - Regular text message
- `image` - Image message (include imageUrl)
- `product` - Product reference (include product ID in referenceId)
- `order` - Order reference (include order ID in referenceId)

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "692msg123456789012345678",
    "conversationId": "691abc123def456789012345",
    "senderId": {
      "_id": "68f123456789abcdef012345",
      "name": "John Doe",
      "imageUrl": "https://example.com/avatar.jpg"
    },
    "senderType": "customer",
    "content": "Hello! I'm interested in this product.",
    "messageType": "text",
    "isRead": false,
    "createdAt": "2025-11-13T10:00:00.000Z"
  }
}
```

---

### 5. Mark Messages as Read
**POST** `/messages/conversation/:conversationId/read`

Mark all unread messages in a conversation as read.

**Body:**
```json
{
  "userType": "customer"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "markedCount": 5,
    "conversationId": "691abc123def456789012345"
  }
}
```

**Example:**
```javascript
const markAsRead = async (conversationId, userType) => {
  try {
    const response = await fetch(
      `http://localhost:3001/v1/messages/conversation/${conversationId}/read`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userType })
      }
    );
    
    const data = await response.json();
    if (data.success) {
      console.log(`Marked ${data.data.markedCount} messages as read`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

### 6. Get Unread Count
**GET** `/messages/unread-count?userType=customer`

Get total unread message count for the user.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalUnread": 12,
    "conversationsWithUnread": 3
  }
}
```

**Example:**
```javascript
const getUnreadCount = async (userType = 'customer') => {
  try {
    const response = await fetch(
      `http://localhost:3001/v1/messages/unread-count?userType=${userType}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    const data = await response.json();
    
    if (data.success) {
      return data.data.totalUnread;
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

### 7. Search Conversations
**GET** `/messages/conversations/search?userType=customer&q=searchQuery`

Search conversations by participant name or message content.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "691abc123def456789012345",
      "customerId": {...},
      "vendorId": {...},
      "lastMessage": {...}
    }
  ]
}
```

---

### 8. Delete Message
**DELETE** `/messages/message/:messageId`

Delete a message (only sender can delete).

**Response:**
```json
{
  "success": true,
  "message": "Message deleted successfully"
}
```

---

### 9. Archive Conversation
**POST** `/messages/conversation/:conversationId/archive`

Archive a conversation.

**Body:**
```json
{
  "userType": "customer"
}
```

---

### 10. Block Conversation
**POST** `/messages/conversation/:conversationId/block`

Block a conversation.

**Body:**
```json
{
  "userType": "customer"
}
```

---

## Socket.IO Events

### Emit Events (Client → Server)

#### Join Conversation Room
```javascript
socket.emit('join_conversation', conversationId);

// Listen for confirmation
socket.on('joined_conversation', (data) => {
  console.log('Joined conversation:', data.conversationId);
});
```

#### Leave Conversation Room
```javascript
socket.emit('leave_conversation', conversationId);

socket.on('left_conversation', (data) => {
  console.log('Left conversation:', data.conversationId);
});
```

#### Send Message (Real-time)
```javascript
socket.emit('send_message', {
  conversationId: '691abc123def456789012345',
  senderId: '68f123456789abcdef012345',
  senderType: 'customer',
  content: 'Hello!',
  messageType: 'text'
});

// Listen for confirmation
socket.on('message_sent', (data) => {
  if (data.success) {
    console.log('Message sent:', data.message);
  }
});

// Listen for errors
socket.on('message_error', (data) => {
  console.error('Message error:', data.error);
});
```

#### Typing Indicators
```javascript
// User starts typing
socket.emit('typing_start', {
  conversationId: '691abc123def456789012345',
  userId: '68f123456789abcdef012345',
  userName: 'John Doe'
});

// User stops typing
socket.emit('typing_stop', {
  conversationId: '691abc123def456789012345',
  userId: '68f123456789abcdef012345'
});
```

#### Mark as Read (Real-time)
```javascript
socket.emit('mark_read', {
  conversationId: '691abc123def456789012345',
  userId: '68f123456789abcdef012345',
  userType: 'customer'
});
```

---

### Listen Events (Server → Client)

#### New Message
```javascript
socket.on('new_message', (message) => {
  console.log('New message received:', message);
  // Add message to UI
  addMessageToChat(message);
  
  // Play notification sound
  playNotificationSound();
  
  // Update unread count if conversation not active
  if (currentConversationId !== message.conversationId) {
    updateUnreadCount();
  }
});
```

#### User Typing
```javascript
socket.on('user_typing', (data) => {
  console.log(`${data.userName} is typing...`);
  showTypingIndicator(data.conversationId, data.userName);
});

socket.on('user_stopped_typing', (data) => {
  hideTypingIndicator(data.conversationId);
});
```

#### Messages Read
```javascript
socket.on('messages_read', (data) => {
  console.log('Messages read in conversation:', data.conversationId);
  updateMessageReadStatus(data.conversationId, data.readBy);
});
```

---

## Complete React Component Example

```javascript
import React, { useState, useEffect, useRef } from 'react';
import socket from '../utils/socket';

const ChatComponent = ({ conversationId, currentUserId, currentUserType }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const token = localStorage.getItem('authToken');

  // Fetch messages on mount
  useEffect(() => {
    fetchMessages();
    joinConversation();

    return () => {
      leaveConversation();
    };
  }, [conversationId]);

  // Set up Socket.IO listeners
  useEffect(() => {
    socket.on('new_message', handleNewMessage);
    socket.on('user_typing', handleUserTyping);
    socket.on('user_stopped_typing', handleUserStoppedTyping);
    socket.on('messages_read', handleMessagesRead);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stopped_typing', handleUserStoppedTyping);
      socket.off('messages_read', handleMessagesRead);
    };
  }, [conversationId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const response = await fetch(
        `http://localhost:3001/v1/messages/conversation/${conversationId}/messages`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      const data = await response.json();
      if (data.success) {
        setMessages(data.data.messages);
        markAsRead();
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const joinConversation = () => {
    socket.emit('join_conversation', conversationId);
  };

  const leaveConversation = () => {
    socket.emit('leave_conversation', conversationId);
  };

  const handleNewMessage = (message) => {
    if (message.conversationId === conversationId) {
      setMessages(prev => [...prev, message]);
      
      // Mark as read if sender is not current user
      if (message.senderId._id !== currentUserId) {
        markAsRead();
      }
    }
  };

  const handleUserTyping = (data) => {
    if (data.conversationId === conversationId && data.userId !== currentUserId) {
      setTypingUser(data.userName);
    }
  };

  const handleUserStoppedTyping = (data) => {
    if (data.conversationId === conversationId) {
      setTypingUser(null);
    }
  };

  const handleMessagesRead = (data) => {
    if (data.conversationId === conversationId) {
      setMessages(prev => 
        prev.map(msg => 
          msg.senderId._id === currentUserId 
            ? { ...msg, isRead: true, readAt: new Date() }
            : msg
        )
      );
    }
  };

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing_start', {
        conversationId,
        userId: currentUserId,
        userName: 'You'
      });
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('typing_stop', {
        conversationId,
        userId: currentUserId
      });
    }, 2000);
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    // Clear typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    setIsTyping(false);
    socket.emit('typing_stop', {
      conversationId,
      userId: currentUserId
    });

    // Send message via Socket.IO
    socket.emit('send_message', {
      conversationId,
      senderId: currentUserId,
      senderType: currentUserType,
      content: newMessage,
      messageType: 'text'
    });

    setNewMessage('');
  };

  const markAsRead = async () => {
    try {
      await fetch(
        `http://localhost:3001/v1/messages/conversation/${conversationId}/read`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ userType: currentUserType })
        }
      );
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="chat-container">
      <div className="messages-list">
        {messages.map((message) => (
          <div
            key={message._id}
            className={`message ${
              message.senderId._id === currentUserId ? 'sent' : 'received'
            }`}
          >
            <div className="message-header">
              <img
                src={message.senderId.imageUrl}
                alt={message.senderId.name}
                className="avatar"
              />
              <span className="sender-name">{message.senderId.name}</span>
              <span className="timestamp">
                {new Date(message.createdAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="message-content">{message.content}</div>
            {message.senderId._id === currentUserId && (
              <div className="message-status">
                {message.isRead ? '✓✓ Read' : '✓ Sent'}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {typingUser && (
        <div className="typing-indicator">
          {typingUser} is typing...
        </div>
      )}

      <div className="message-input">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => {
            setNewMessage(e.target.value);
            handleTyping();
          }}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              sendMessage();
            }
          }}
          placeholder="Type a message..."
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
};

export default ChatComponent;
```

---

## Conversation List Component Example

```javascript
import React, { useState, useEffect } from 'react';

const ConversationList = ({ userType, onSelectConversation }) => {
  const [conversations, setConversations] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const token = localStorage.getItem('authToken');

  useEffect(() => {
    fetchConversations();
    fetchUnreadCount();
  }, []);

  const fetchConversations = async () => {
    try {
      const response = await fetch(
        `http://localhost:3001/v1/messages/conversations?userType=${userType}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      const data = await response.json();
      if (data.success) {
        setConversations(data.data.conversations);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await fetch(
        `http://localhost:3001/v1/messages/unread-count?userType=${userType}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      const data = await response.json();
      if (data.success) {
        setUnreadCount(data.data.totalUnread);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div className="conversation-list">
      <div className="header">
        <h2>Messages</h2>
        {unreadCount > 0 && (
          <span className="unread-badge">{unreadCount}</span>
        )}
      </div>

      <div className="conversations">
        {conversations.map((conv) => {
          const otherUser = userType === 'customer' ? conv.vendorId : conv.customerId;
          const unread = userType === 'customer' 
            ? conv.unreadCountCustomer 
            : conv.unreadCountVendor;

          return (
            <div
              key={conv._id}
              className={`conversation-item ${unread > 0 ? 'unread' : ''}`}
              onClick={() => onSelectConversation(conv._id)}
            >
              <img src={otherUser.imageUrl} alt={otherUser.name} />
              <div className="conversation-details">
                <h4>{otherUser.name}</h4>
                <p className="last-message">
                  {conv.lastMessage?.content || 'No messages yet'}
                </p>
                <span className="timestamp">
                  {new Date(conv.updatedAt).toLocaleString()}
                </span>
              </div>
              {unread > 0 && (
                <span className="unread-count">{unread}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ConversationList;
```

---

## Best Practices

1. **Always join conversation room** before displaying messages
2. **Handle Socket.IO reconnection** gracefully
3. **Mark messages as read** when user opens conversation
4. **Show typing indicators** for better UX
5. **Play notification sounds** for new messages
6. **Update unread counts** in real-time
7. **Implement optimistic UI updates** for sent messages
8. **Handle offline scenarios** with message queue
9. **Implement pagination** for message history
10. **Clean up Socket.IO listeners** on component unmount

---

## Testing Checklist

- ✅ Customer can start conversation with vendor
- ✅ Messages sent in real-time via Socket.IO
- ✅ Messages also work via REST API
- ✅ Typing indicators show correctly
- ✅ Read receipts update properly
- ✅ Unread counts accurate
- ✅ Messages persist across page refresh
- ✅ Conversation list updates in real-time
- ✅ Search conversations works
- ✅ Archive and block functionality works
- ✅ Socket.IO reconnects automatically
- ✅ Multiple tabs/devices sync properly

---

## Console Logs

The backend logs all messaging events:
```
💬 [MESSAGE] Getting/creating conversation: customer 123... <-> vendor 456...
✅ [MESSAGE] Conversation found: 691abc...
💬 [SOCKET] Socket abc123 joined conversation: 691abc...
💬 [SOCKET] Sending message in conversation 691abc...
✅ [SOCKET] Message sent successfully: 692msg...
✅ [MESSAGE] Marked 5 messages as read
```

---

## Support

For issues:
1. Check browser console for Socket.IO connection
2. Verify JWT token is valid
3. Check backend console logs
4. Ensure conversation exists before sending messages
5. Verify user is part of the conversation
