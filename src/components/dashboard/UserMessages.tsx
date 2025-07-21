import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Clock, Send, ChevronRight, ChevronLeft, Search, User } from 'lucide-react';

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

type VendorDetails = Partial<{
  id: string;
  user_id: string;
  business_name: string;
  city: string;
  phone: string;
  email: string;
  description: string;
  logo_url: string;
  website: string;
  created_at: string;
}>;

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentVendor, setCurrentVendor] = useState<VendorDetails | null>(null);
  const [vendors, setVendors] = useState<Record<string, VendorInfo>>({});

  const [searchParams] = useSearchParams();
  const vendorId = searchParams.get('to');

  const { user } = useAuth();
  const userId = user?.id;

  // Fetch vendor info & chat messages
  useEffect(() => {
    const initChat = async () => {
      if (!vendorId || !userId) return;

      const { data: vendor, error: vendorError } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', vendorId)
        .single();

      if (vendorError || !vendor) {
        console.error('❌ Error fetching vendor:', vendorError);
        return;
      }

      setCurrentVendor(vendor);

      const vendorUserId = vendor.user_id;

      const { data: msgs, error: msgErr } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_id.eq.${userId},receiver_id.eq.${vendorUserId}),and(sender_id.eq.${vendorUserId},receiver_id.eq.${userId})`
        )
        .order('created_at', { ascending: true });

      if (msgErr) {
        console.error('❌ Error fetching messages:', msgErr);
        return;
      }

      setMessages(msgs || []);
    };

    initChat();
  }, [vendorId, userId]);

  // Realtime message subscription
  useEffect(() => {
    if (!userId ||  !currentVendor?.user_id) return;

    const vendorUserId = currentVendor.user_id;

    const filter = `or(
      and(sender_id.eq.${userId},receiver_id.eq.${vendorUserId}),
      and(sender_id.eq.${vendorUserId},receiver_id.eq.${userId})
    )`;

     const channelId = `messages_convo_${userId}_${vendorUserId}`;

      console.log("chanid",channelId);
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId,  currentVendor?.user_id]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !vendorId || !userId || !currentVendor?.user_id) return;

    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          sender_id: userId,
          receiver_id: currentVendor.user_id,
          vendor_id: vendorId,
          user_id: userId,
          message: newMessage.trim(),
        },
      ])
      .select('*');

    if (error) {
      console.error('❌ Supabase insert error:', error);
      return;
    }

    if (data?.length) {
      setMessages((prev) => [...prev, data[0]]);
      setNewMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const conversationList: Conversation[] = useMemo(() => {
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
        messages: msgs,
      };
    });
  }, [messages, vendors, userId]);

  useEffect(() => {
    if (vendorId && conversationList.length > 0) {
      setActiveConversationId(vendorId);
    }
  }, [vendorId, conversationList]);

  const activeConversation = useMemo(() => {
    const found = conversationList.find(c => c.id === activeConversationId);
    if (found) return found;

    if (vendorId && userId) {
      const vendorInfo = vendors[vendorId] ?? {
        vendorName: 'Vendor',
        vendorImage: '/default.png',
      };

      return {
        id: vendorId,
        vendorImage: vendorInfo.vendorImage,
        vendorName: vendorInfo.vendorName,
        lastMessage: '',
        lastMessageTime: '',
        unread: false,
        messages: [],
      };
    }

    return undefined;
  }, [activeConversationId, conversationList, vendorId, vendors, userId]);

  const toggleMobileView = () => {
    setShowMobileList(!showMobileList);
  };

  return (
    <div className="p-4">
      <div className="md:flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Messages</h2>
        <div className="relative mt-2 md:mt-0 max-w-xs">
          <input
            type="text"
            placeholder="Search messages..."
            className="w-full py-2 pl-9 pr-4 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 dark:bg-gray-700 dark:text-white"
          />
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400" />
        </div>
      </div>

      <div className="md:hidden flex justify-between items-center mb-4">
        <button onClick={toggleMobileView} className="flex items-center gap-1 text-sm text-purple-600 dark:text-purple-400">
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

      <div className="flex flex-col md:flex-row bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700 h-[600px]">
        <div className={`w-full md:w-1/3 ${showMobileList ? 'block' : 'hidden'} md:block border-r border-gray-200 dark:border-gray-700`}>
          <div className="h-full overflow-y-auto">
            {conversationList.map(conversation => (
              <div
                key={conversation.id}
                onClick={() => {
                  setActiveConversationId(conversation.id);
                  setShowMobileList(false);
                }}
                className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition ${
                  activeConversationId === conversation.id ? 'bg-purple-50 dark:bg-purple-900/10' : ''
                } ${conversation.unread ? 'border-l-4 border-purple-600 dark:border-purple-400' : ''}`}
              >
                <div className="flex items-center">
                  <img src={conversation.vendorImage} alt={conversation.vendorName} className="w-12 h-12 rounded-full object-cover" />
                  <div className="ml-3 flex-1">
                    <div className="flex justify-between items-center">
                      <h3 className={`font-semibold ${conversation.unread ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                        {conversation.vendorName}
                      </h3>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{conversation.lastMessageTime}</span>
                    </div>
                    <p className={`text-sm truncate ${conversation.unread ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>
                      {conversation.lastMessage}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`w-full md:w-2/3 flex flex-col ${showMobileList ? 'hidden' : 'flex'} md:flex`}>
          {activeConversation ? (
            <>
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center">
                <img src={activeConversation.vendorImage} alt={activeConversation.vendorName} className="w-10 h-10 rounded-full object-cover" />
                <div className="ml-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{activeConversation.vendorName}</h3>
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                    <Clock size={12} className="mr-1" />
                    <span>Usually responds within 1 hour</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => {
                  const isUser = message.sender_id === userId;
                  return (
                    <div key={message.id || message.created_at} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-xs md:max-w-md rounded-lg px-4 py-2 ${
                          isUser
                            ? 'bg-purple-600 text-white rounded-br-none'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'
                        }`}
                      >
                        <p className="text-sm">{message.message}</p>
                        <p className={`text-xs mt-1 ${isUser ? 'text-purple-200' : 'text-gray-500 dark:text-gray-400'}`}>
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
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No conversation selected</h3>
                <p className="text-gray-600 dark:text-gray-400">Choose a conversation from the list to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserMessages;
