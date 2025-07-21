import React, { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { supabase } from '../../services/supabase';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: string;
}

const VendorMessages: React.FC = () => {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session ? session.user : null;
      if (!user) {
        setMessages([]);
        setLoading(false);
        return;
      }

      // Fetch messages where receiver is this vendor's user id
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        setMessages([]);
      } else {
        setMessages(data || []);
      }
      setLoading(false);
    };

    fetchMessages();
  }, []);

 
 //Send Message



  // Add this useEffect in both components
  useEffect(() => {
    if (!activeConversationId) return;

    const channel = supabase
      .channel(`conversation_${activeConversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `user_id=eq.${activeConversationId}`
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId]);

   if (loading) {
    return <p>Loading messages...</p>;
  }


  if (messages.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <MessageCircle size={32} className="text-gray-400 dark:text-gray-500" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No messages yet
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-sm mx-auto">
          When customers send you messages about your services, they'll appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">Messages</h2>
      <ul className="space-y-4">
        {messages.map((msg) => (
          <li key={msg.id} className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <p className="text-gray-700 dark:text-gray-300">{msg.message}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {new Date(msg.created_at).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default VendorMessages;
