import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase.js';
import { ChatMessageList } from './ChatMessageList.jsx';
import { ChatInput } from './ChatInput.jsx';
import { toast } from 'react-toastify';

const ChatContainer = ({ chatId, onSourceClick, selectedDocuments }) => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Fetch chat history when component mounts
  useEffect(() => {
    const fetchChatHistory = async () => {
      try {
        const { data: queries, error } = await supabase
          .from('queries')
          .select(`
            id,
            query_text,
            response_text,
            source_references,
            timestamp
          `)
          .eq('chat_id', chatId)
          .order('timestamp', { ascending: true });

        if (error) throw error;
        console.log('Fetched queries:', queries);

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
    console.log('handleSubmit called with message:', message);
  
    if (isLoading) {
        console.log('Submit blocked - already loading');
        return;
    }
    setIsLoading(true);
    try {
        const recentMessage = messages[messages.length - 1];
        if (recentMessage && recentMessage.isUser && recentMessage.message === message) {
          console.log('Duplicate message detected');
          return;
        }

      const isFirstMessage = messages.length === 0;

      // Add user message immediately
      const userMessage = {
        id: `user-${Date.now()}`,
        isUser: true,
        message,
      };
      setMessages((prev) => [...prev, userMessage]);
  
      // Get user's JWT token
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No active session');
      }

      // If this is the first message, update chat title
      if (isFirstMessage) {
        try {
          console.log('Generating title for chat:', chatId);
          const titleResponse = await fetch(
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
  
          if (!titleResponse.ok) {
            throw new Error('Failed to update chat title');
          }
        } catch (error) {
          console.error('Error updating chat title:', error);
        }
      }
  

      // Make API call to document-query function
      console.log('Selected documents being sent:', selectedDocuments);
      const response = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/document-query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        
        body: JSON.stringify({
            chatId,
            query: message,
            selectedDocuments: selectedDocuments, // Add this line
            pagination: { pageSize: 5, pageNumber: 1 },
        }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response');
      }

      const data = await response.json();

      // Add assistant response
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        isUser: false,
        message: data.response,
        sources: data.sourceReferences,
      };

      setMessages((prev) => [...prev, assistantMessage]);


    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to process your request');
      
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          isUser: false,
          message: 'Sorry, I encountered an error processing your request. Please try again.',
        },
      ]);
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