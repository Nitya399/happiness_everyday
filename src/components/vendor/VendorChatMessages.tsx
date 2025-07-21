import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Send, Clock, ChevronLeft, ChevronRight, Search, User } from 'lucide-react';

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

interface UserInfo {
  userName: string;
  userImage: string;
}

type VendorDetails = Partial<{
  id: string;             // UUID
  user_id: string;        // UUID
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
  userImage: string;
  userName: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  messages: Message[];
}

const VendorMessages: React.FC = () => {
  const { user } = useAuth();
  const vendorId = user?.id;
  console.log("vendor id >>>>>>>>>>", vendorId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState<Record<string, UserInfo>>({});
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showMobileList, setShowMobileList] = useState(true);
  const [currentVendor,setCurrentVendor] = useState<VendorDetails|null>(null);

  // Fetch messages where vendor is involved
  useEffect(() => {
  if (!vendorId) return;

  supabase
    .from('messages')
    .select('*, sender:users(name)')
    .or(`sender_id.eq.${vendorId},receiver_id.eq.${vendorId}`)
    .order('created_at', { ascending: true })
    .then(({ data, error }) => {
      if (error) {
        console.error('❌ Error fetching messages:', error.message);
      } else {
        console.log('📥 Vendor fetched messages:', data);
        setMessages(data || []);
      }
    });
}, [vendorId]);



  useEffect(() => {
  if (!vendorId) return;

    const channel = supabase
    .channel(`vendor_messages_${vendorId}`, {
        config: { presence: { key: vendorId } },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${vendorId}`,
        },
      (payload) => {
        const newMessage = payload.new as Message;
        setMessages(prev => [...prev, newMessage]);
      }
    )
    .subscribe();


  return () => {
    supabase.removeChannel(channel);
  };
}, [vendorId]);



  // Build conversation list
  const conversationList: Conversation[] = useMemo(() => {
    const grouped = messages.reduce((acc, msg) => {
      (acc[msg.user_id] ||= []).push(msg);
      return acc;
    }, {} as Record<string, Message[]>);

    return Object.entries(grouped).map(([uid, msgs]) => {
      const last = msgs[msgs.length - 1];
      const info = users[uid] ?? { userName: 'User', userImage: '/default-user.png' };
      const unread = msgs.some(m => m.sender_id === uid && m.receiver_id === vendorId);

      return {
        id: uid,
        userImage: info.userImage,
        userName: info.userName,
        lastMessage: last.message,
        lastMessageTime: new Date(last.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        unread,
        messages: msgs
      };
    });
  }, [messages, users, vendorId]);

  // Fetch user info on mount (optional if already in DB)
  useEffect(() => {
    const fetchUsers = async () => {
      const userIds = [...new Set(messages.map(m => m.user_id))];
      if (userIds.length === 0) return;

      const { data, error } = await supabase
        .from('users')
        .select('id, name, image_url')
        .in('id', userIds);

      if (data) {
        const map: Record<string, UserInfo> = {};
        data.forEach(u => {
          map[u.id] = {
            userName: u.name,
            userImage:   '/default-user.png',
          };
        });
        setUsers(map);
      }

      if (error) console.error('Error fetching user data:', error.message);
    };

    fetchUsers();
    fetchVendor();
  }, [messages]);

  const activeConversation = useMemo(() => {
    return conversationList.find(c => c.id === activeConversationId);
  }, [activeConversationId, conversationList]);

  const fetchVendor = async () => {
    const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('user_id', vendorId)
    .single();
  console.log("data cle");

  if (error || !data?.id) {
    console.error('❌ Could not fetch vendor.id from vendors table', error);
    alert("Your vendor profile is missing or invalid.");
    return;
  }
  console.log("vendor data",data); 
  setCurrentVendor(data);// Type-safe!
  };

   useEffect(() => {
      if (!activeConversationId || !vendorId || !currentVendor?.user_id) return;
  
      const vendorUserId = currentVendor.user_id;
  
      const filter = `or(
        and(sender_id.eq.${activeConversationId},receiver_id.eq.${vendorUserId}),
        and(sender_id.eq.${vendorUserId},receiver_id.eq.${activeConversationId})
      )`;
      const channelId = `messages_convo_${activeConversationId}_${vendorUserId}`;

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
    }, [activeConversationId, vendorId, currentVendor?.user_id]);

  // send meassage 
  const sendMessage = async () => {
    // console.log("is error ",!newMessage.trim()," id ", !activeConversationId ," er ",!vendorId);
  if (!newMessage.trim() || !activeConversationId || !vendorId) return;

  
  // First, fetch the vendor's `vendors.id` from the vendors table
 

  const vendorTableId = currentVendor!.id;
  console.log("vid",currentVendor);

  // Optional: prevent reply before user has initiated
  const existingMessages = messages.filter(
    m => m.sender_id === activeConversationId && m.receiver_id === vendorId
  );

  if (existingMessages.length === 0) {
    alert("You can't start a new conversation. Wait for the user to message first.");
    return;
  }

  const content = newMessage.trim();

  const { data, error } = await supabase.from('messages').insert([{
    sender_id: currentVendor!.user_id!,
    receiver_id: activeConversationId,
    vendor_id: vendorTableId,         // ✅ correct vendor_id from vendors table
    user_id: activeConversationId,
    message: content,
  }]).select();

  if (error) {
    console.error('❌ Error sending message:', error.message);
  } else {
    setMessages(prev => [...prev, ...(data || [])]);
    setNewMessage('');
  }
};


  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleMobileView = () => setShowMobileList(!showMobileList);

  return (
    <div className="p-4">
      <div className="md:flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Vendor Messages</h2>
        <div className="relative mt-2 md:mt-0 max-w-xs">
          <input
            type="text"
            placeholder="Search..."
            className="w-full py-2 pl-9 pr-4 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 dark:bg-gray-700 dark:text-white"
          />
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400" />
        </div>
      </div>

      <div className="md:hidden flex justify-between items-center mb-4">
        <button onClick={toggleMobileView} className="flex items-center gap-1 text-sm text-purple-600 dark:text-purple-400">
          {showMobileList ? <><ChevronRight size={16} /> View Conversation</> : <><ChevronLeft size={16} /> Back</>}
        </button>
      </div>

      <div className="flex flex-col md:flex-row bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 h-[600px]">
        {/* Sidebar */}
        <div className={ `w-full md:w-1/3 border-r border-gray-200 dark:border-gray-700 ${showMobileList ? 'block' : 'hidden'} md:block`}>
          <div className="h-full overflow-y-auto">
            {conversationList.map((conversation) => (
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
                  <img
                    src={conversation.userImage}
                    alt={conversation.userName}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div className="ml-3 flex-1 overflow-hidden">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{conversation.userName}</h3>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{conversation.lastMessageTime}</span>
                    </div>
                    <p className="text-sm truncate text-gray-500 dark:text-gray-400">{conversation.lastMessage}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Conversation View */}
        <div className={ `w-full md:w-2/3 flex flex-col ${showMobileList ? 'hidden' : 'flex'} md:flex` }> {/*`w-full md:w-2/3 flex flex-col ${showMobileList ? 'hidden' : 'block'} md:block` */}
          {activeConversation ? (
            <>
              <div className=" px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center"> {/*px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center */}
                <img src={activeConversation.userImage} alt={activeConversation.userName} className="w-10 h-10 rounded-full object-cover" />
                <div className="ml-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{activeConversation.userName}</h3>
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                    <Clock size={12} className="mr-1" />
                    <span>Typically replies quickly</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages
                    .filter(msg =>
                      (msg.sender_id === vendorId && msg.receiver_id === activeConversationId) ||
                      (msg.sender_id === activeConversationId && msg.receiver_id === vendorId)
                    )
                    .map(message => {
                      const isVendor = message.sender_id === vendorId;
                      return (
                        <div key={message.id} className={`flex ${isVendor ? 'justify-end' : 'justify-start'}`}>
                          <div className={`rounded-lg px-4 py-2 max-w-xs ${
                            isVendor ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-900'
                          }`}>
                            <div className={`text-xs mb-1 ${isVendor ? 'text-right text-purple-500' : 'text-left text-gray-500'}`}>
                              {message.sender?.name || (isVendor ? 'You' : 'User')}
                            </div>
                            <p>{message.message}</p>
                            <span className="block text-xs mt-1 text-gray-400">
                              {new Date(message.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      );
                    })}


              </div>

              {/* Input */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your reply..."
                    className="flex-1 py-2 px-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white resize-none h-12"
                  ></textarea>
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    className={`ml-2 p-2 rounded-full ${
                      newMessage.trim()
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
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
                <p className="text-gray-600 dark:text-gray-400">Select a user to respond to their message.</p>
              </div>
            </div>
          )}
         </div> 
      </div>
    </div>
  );
};

export default VendorMessages;
