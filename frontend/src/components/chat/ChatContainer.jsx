import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase.js';
import { ChatMessageList } from './ChatMessageList.jsx';
import { ChatInput } from './ChatInput.jsx';
import { toast } from 'react-toastify';

const ChatContainer = ({ chatId, onSourceClick, selectedDocuments }) => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    const fetchChatHistory = async () => {
      try {
        const { data: queries, error } = await supabase
          .from('queries')
          .select('*')
          .eq('chat_id', chatId)
          .order('timestamp', { ascending: true });

        if (error) throw error;

        const formattedMessages = queries.flatMap(query => [
          {
            id: `user-${query.id}`,
            isUser: true,
            message: query.query_text,
          },
          {
            id: `assistant-${query.id}`,
            isUser: false,
            message: query.response_text,
            sources: query.source_references || [],
          }
        ]);

        setMessages(formattedMessages);
      } catch (error) {
        console.error('Error fetching chat history:', error);
        toast.error('Failed to load chat history');
      } finally {
        setIsInitialLoad(false);
      }
    };

    if (chatId) {
      fetchChatHistory();
    }
  }, [chatId]);

  const handleSubmit = async (message) => {
    if (isLoading || !message.trim()) return;

    setIsLoading(true);
    
    try {
      // Add user message immediately
      const userMessage = {
        id: `user-${Date.now()}`,
        isUser: true,
        message,
      };
      setMessages(prev => [...prev, userMessage]);

      const isFirstMessage = messages.length === 0;
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No active session');
      }

      // If first message, generate chat title
      if (isFirstMessage) {
        try {
          await fetch(
            `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/chat-title-generator`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                chatId,
                firstMessage: message,
              }),
            }
          );
        } catch (error) {
          console.error('Error updating chat title:', error);
        }
      }

      // Send query to chat-query edge function
      const response = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/chat-query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            chatId,
            query: message,
            documentIds: selectedDocuments
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get response');
      }

      const { response: assistantMessage, sourceReferences } = await response.json();

      // Add assistant response
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        isUser: false,
        message: assistantMessage,
        sources: sourceReferences,
      }]);

    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Failed to process your request');
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        isUser: false,
        message: 'Sorry, I encountered an error processing your request. Please try again.',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isInitialLoad) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Loading chat history...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ChatMessageList 
        messages={messages} 
        onSourceClick={onSourceClick} 
      />
      <ChatInput 
        onSubmit={handleSubmit} 
        isLoading={isLoading} 
      />
    </div>
  );
};

export default ChatContainer;