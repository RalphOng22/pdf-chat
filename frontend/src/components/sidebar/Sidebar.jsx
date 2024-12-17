import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, MessageSquare, Plus, FileText, LogOut, Trash2 } from 'lucide-react'; 
import { useAuth } from '../../context/AuthContext.jsx';
import { supabase } from '../../services/supabase.js';
import DeleteChatDialog from './DeleteChatDialog.jsx';
import { toast } from 'react-toastify'; 

const Sidebar = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchChats();
  }, []);

  const fetchChats = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('chats')
        .select('id, title')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setChats(data || []);
    } catch (err) {
      console.error('Error fetching chats:', err);
      setError('Failed to load chats.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChat = async (chatId, e) => {
    e.stopPropagation(); // Prevent chat navigation when clicking delete
    
    if (!window.confirm('Are you sure you want to delete this chat?')) {
      return;
    }

    try {
      // Delete all related records first
      await supabase.from('queries').delete().eq('chat_id', chatId);
      await supabase.from('documents').delete().eq('chat_id', chatId);
      
      // Finally delete the chat
      const { error } = await supabase
        .from('chats')
        .delete()
        .eq('id', chatId);

      if (error) throw error;

      // Update local state
      setChats(chats.filter(chat => chat.id !== chatId));
      toast.success('Chat deleted successfully');

      // If user is currently on the deleted chat's page, redirect to home
      const currentPath = window.location.pathname;
      if (currentPath.includes(`/chat/${chatId}`)) {
        navigate('/');
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast.error('Failed to delete chat');
    }
  };

  return (
    <div className="w-72 bg-[#1a1f2b]/90 hover:backdrop-blur-sm text-white flex flex-col h-full shadow-xl transition-all">
      {/* Header */}
      <div className="px-6 py-6 border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <FileText className="w-8 h-8 text-blue-400" />
          <h2 className="text-xl font-semibold">PDF Chatbot</h2>
        </div>
      </div>

      {/* Upload Button */}
      <div className="px-4 py-6">
        <button
          onClick={() => navigate('/upload')}
          className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
        >
          <Upload className="w-5 h-5" />
          <span>Upload PDF</span>
        </button>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-400">RECENT CHATS</span>
          </div>
        </div>
        <div className="space-y-1">
          {loading ? (
            <div className="px-6 text-gray-400">Loading chats...</div>
          ) : error ? (
            <div className="px-6 text-red-500">{error}</div>
          ) : chats.length > 0 ? (
            chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => navigate(`/chat/${chat.id}`)}
                className="group w-full flex items-center px-6 py-3 hover:bg-gray-800/80 hover:backdrop-blur-sm transition-all cursor-pointer"
              >
                <div className="flex items-center min-w-0 flex-1">
                  <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0 mr-3" />
                  <span className="text-sm text-gray-300 truncate">
                    {chat.title || 'Untitled Chat'}
                  </span>
                </div>
                <DeleteChatDialog 
                  chatTitle={chat.title}
                  onDelete={(e) => {
                    e.stopPropagation();
                    handleDeleteChat(chat.id, e);
                  }}
                />
              </div>
            ))            
          ) : (
            <div className="px-6 text-gray-400">No chats available.</div>
          )}
        </div>
      </div>

      {/* Footer - unchanged */}
      <div className="border-t border-gray-700 p-4">
        <button
          onClick={signOut}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
        <div className="mt-4 text-xs text-center text-gray-500">
          © 2024 PDF Chatbot
        </div>
      </div>
    </div>
  );
};

export default Sidebar;