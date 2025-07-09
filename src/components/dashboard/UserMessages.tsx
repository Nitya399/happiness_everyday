import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabase.ts'; // Keep this for authentication and updates
import { useAuth } from '../../contexts/AuthContext.tsx';
import { motion } from 'framer-motion';
import { Check, Clock, Send, ChevronRight, ChevronLeft, Search, User } from 'lucide-react';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';


interface Message {
  id: number;
  sender_id: string;
  receiver_id: string;
  vendor_id: string;
  user_id: string;
  message: string;
  created_at: string;
  sender?: {
    name: string;
    image_url?: string;
  };
}

interface VendorInfo {
  vendorName: string;
  vendorImage: string;
}

interface Conversation {
  id: string;
  vendorImage: string;
  vendorName: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  messages: Message[];
}

const UserMessages: React.FC = () => {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showMobileList, setShowMobileList] = useState(true);
  const [searchParams] = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<Record<string, VendorInfo>>({});
  const [loadingVendors, setLoadingVendors] = useState(true);


  const vendorId = searchParams.get('to');

  // const { vendorId } = useParams();
  console.log("vendor id >>>>>>",vendorId);
  const { user } = useAuth();
  console.log("user id>>>>>>",user?.id);
  const userId = user?.id;


  // Get vendorUserId from vendors table


  // Fetch messages
  useEffect(() => {
  console.log('👤 userId:', userId, typeof userId);
  console.log('🏷 vendorId:', vendorId, typeof vendorId);
  
  if (!vendorId || !userId) {
    console.warn('🚫 Skipping fetch: missing vendorId or userId');
    return;
  }

  

  supabase
  .from('messages')
  .select('*')
  .or(
  `and(sender_id.eq.${userId},receiver_id.eq.${vendorId}),and(sender_id.eq.${vendorId},receiver_id.eq.${userId})`
   )
  .order('created_at', { ascending: true })
  .then(({ data, error }) => {
    setMessages(data || []);
  });

}, [vendorId, userId]);


  // Send message
    const sendMessage = async () => {
    if (!newMessage.trim() || !vendorId || !userId) {
      return;
    }

    // 🔍 Lookup the correct user_id from the vendors table
    const { data: vendorUser, error } = await supabase
      .from('vendors')
      .select('user_id')
      .eq('id', vendorId)  // This is the vendors.id from the search param
      .single();

    if (error || !vendorUser) {
      console.error('❌ Failed to fetch vendor user_id');
      return;
    }

    const resolvedVendorUserId = vendorUser.user_id;

    const { data, error: insertError } = await supabase.from('messages').insert([{
      sender_id: userId,
      receiver_id: resolvedVendorUserId,   // ✅ correct user_id
      vendor_id: vendorId,                 // still store vendors.id for display context
      user_id: userId,
      message: newMessage.trim(),
    }]).select('*');

    if (insertError) {
      console.error('❌ Supabase insert error:', insertError);
      return;
    }

    if (data?.length) {
      setMessages(prev => [...prev, data[0]]);
      setNewMessage('');
    }
  };

  
useEffect(() => {
  if (!userId || !vendorId) return;

  const filter = `or(and(sender_id.eq.${userId},receiver_id.eq.${vendorId}),and(sender_id.eq.${vendorId},receiver_id.eq.${userId}))`;

  const channel = supabase
    .channel('messages_conversation_' + userId + '_' + vendorId)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: filter,
      },
      (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [userId, vendorId]);



  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };


  

  // useEffect(() => {
  //   if (messages.length === 0) return;


  //     const fetchVendors = async () => {
  //     const ids = Array.from(new Set(messages.map(m => m.vendor_id)));
  //     const { data, error } = await supabase
  //       .from('vendors')
  //       .select('id, name, image_url')
  //       .in('id', ids);

  //     if (error) {
  //       console.error('Error fetching vendors:', error.message);
  //     } else if (data) {
  //       const map: Record<string, VendorInfo> = {};
  //       data.forEach(v => {
  //         map[v.id] = {
  //           vendorName: v.name,
  //           vendorImage: v.image_url
  //         };
  //       });
  //       setVendors(map);
  //     }
  //     setLoadingVendors(false);
  //   };

  //   fetchVendors();
  // }, [messages]);


 // Build conversation list
  const conversationList: Conversation[] = React.useMemo(() => {
    const grouped = messages.reduce((acc, msg) => {
      (acc[msg.vendor_id] ||= []).push(msg);
      return acc;
    }, {} as Record<string, Message[]>);

    return Object.entries(grouped).map(([vid, msgs]) => {
      const last = msgs[msgs.length - 1];
      const info = vendors[vid] ?? { vendorName: 'Unknown', vendorImage: '/default.png' };
      const unread = msgs.some(m => m.sender_id !== userId && m.receiver_id === userId);

      return {
        id: vid,
        vendorImage: info.vendorImage,
        vendorName: info.vendorName,
        lastMessage: last.message,
        lastMessageTime: new Date(last.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        unread,
        messages: msgs
      };
    });
  }, [messages, vendors, userId]);

  useEffect(() => {
    console.log('📬 conversationList after message send:', conversationList);
  }, [conversationList]);


  

  useEffect(() => {
   console.log('💬 conversationList:', conversationList);
  }, [conversationList]);

  useEffect(() => {
    if (vendorId && conversationList.length > 0) {
      console.log('➡️ Setting activeConversationId to', vendorId);
      setActiveConversationId(vendorId);
    }
  }, [vendorId, conversationList]);



  const activeConversation = React.useMemo(() => {
    const found = conversationList.find(c => c.id === activeConversationId);
    if (found) return found;

    if (vendorId && userId) {
      const vendorInfo = vendors[vendorId] ?? {
        vendorName: 'Vendor',
        vendorImage: '/default.png'
      };

      return {
        id: vendorId,
        vendorImage: vendorInfo.vendorImage,
        vendorName: vendorInfo.vendorName,
        lastMessage: '',
        lastMessageTime: '',
        unread: false,
        messages: []
      };
    }

    return undefined;
  }, [activeConversationId, conversationList, vendorId, vendors, userId]);


  const toggleMobileView = () => {
    setShowMobileList(!showMobileList);
  };
  
  return (

    <div className="p-4">
      {/* Header & Search */}
      <div className="md:flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Messages
        </h2>
        <div className="relative mt-2 md:mt-0 max-w-xs">
          <input
            type="text"
            placeholder="Search messages..."
            className="w-full py-2 pl-9 pr-4 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 dark:bg-gray-700 dark:text-white"
          />
          <Search
            size={16}
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400"
          />
        </div>
      </div>

      {/* Mobile Toggle */}
      <div className="md:hidden flex justify-between items-center mb-4">
        <button
          onClick={toggleMobileView}
          className="flex items-center gap-1 text-sm text-purple-600 dark:text-purple-400"
        >
          {showMobileList ? (
            <>
              <ChevronRight size={16} />
              View Conversation
            </>
          ) : (
            <>
              <ChevronLeft size={16} />
              Back to messages list
            </>
          )}
        </button>
      </div>

      {/* Layout Container */}
      <div className="flex flex-col md:flex-row bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700 h-[600px]">
        {/* Left Sidebar (Conversations List) */}
        <div
          className={`w-full md:w-1/3 md:block border-r border-gray-200 dark:border-gray-700 ${
            showMobileList ? 'block' : 'hidden'
          }`}
        >
          <div className="h-full flex flex-col">
            <div className="overflow-y-auto flex-1">
              {conversationList.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => {
                    setActiveConversationId(conversation.id);
                    setShowMobileList(false);
                  }}
                  className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition ${
                    activeConversationId === conversation.id
                      ? 'bg-purple-50 dark:bg-purple-900/10'
                      : ''
                  } ${conversation.unread ? 'border-l-4 border-purple-600 dark:border-purple-400' : ''}`}
                >
                  <div className="flex items-center">
                    <div className="relative">
                      <img
                        src={conversation.vendorImage}
                        alt={conversation.vendorName}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      {conversation.unread && (
                        <span className="absolute top-0 right-0 w-3 h-3 bg-purple-600 rounded-full"></span>
                      )}
                    </div>
                    <div className="ml-3 flex-1 overflow-hidden">
                      <div className="flex justify-between items-center">
                        <h3
                          className={`font-semibold ${
                            conversation.unread
                              ? 'text-gray-900 dark:text-white'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {conversation.vendorName}
                        </h3>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {conversation.lastMessageTime}
                        </span>
                      </div>
                      <p
                        className={`text-sm truncate ${
                          conversation.unread
                            ? 'text-gray-800 dark:text-gray-200'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {conversation.lastMessage}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Section (Conversation Area) */}
        <div
          className={`w-full md:w-2/3 flex flex-col ${showMobileList ? 'hidden' : 'flex'} md:flex`} 
        >   {/*`w-full md:w-2/3 flex flex-col ${
            showMobileList ? 'hidden' : 'block'
          } md:block`*/}
          {activeConversation ? (
            <>
              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center"> {/*px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center */}
                <img
                  src={activeConversation.vendorImage}
                  alt={activeConversation.vendorName}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div className="ml-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {activeConversation.vendorName}
                  </h3>
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                    <Clock size={12} className="mr-1" />
                    <span>Usually responds within 1 hour</span>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => {
                  const isUser = message.sender_id === userId;

                
                return (
                  <div
                    key={message.id || message.created_at}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`text-xs mb-1 ${isUser ? 'text-right text-purple-500' : 'text-left text-gray-500'}`}>
                      {message.sender?.name || (isUser ? 'You' : 'Vendor')}
                    </div>
                    <div
                      className={`max-w-xs md:max-w-md rounded-lg px-4 py-2 ${
                        isUser
                          ? 'bg-purple-600 text-white rounded-br-none'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'
                      }`}
                    >
                      <p className="text-sm">{message.message}</p>
                      <p
                          className={`text-xs mt-1 ${
                            isUser
                              ? 'text-purple-200'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                        {new Date(message.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                );
                })}
              </div>

              {/* Message Input */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your message..."
                    className="flex-1 py-2 px-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 dark:bg-gray-700 dark:text-white resize-none h-12"
                  ></textarea>
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    
                    className={`ml-2 p-2 rounded-full ${
                      newMessage.trim()
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    } transition`}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <div className="inline-block p-4 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                  <User size={32} className="text-gray-500 dark:text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  No conversation selected
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Choose a conversation from the list to start chatting
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

  );
}

export default UserMessages;