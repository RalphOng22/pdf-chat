import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

export function ChatInput({ onSubmit, isLoading }) {
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    
    e.preventDefault();
    
    // Trim message once to reuse
    const trimmedMessage = message.trim();
  
    // Guard clauses for empty message or loading state
    if (!trimmedMessage) return;
    if (isLoading) {
      console.log('Submit blocked - already loading');
      return;
    }
    
    try {
      // Clear input before awaiting response to prevent double submit
      setMessage('');
      await onSubmit(trimmedMessage);
      console.log('ChatInput submitted:', trimmedMessage);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Optionally restore message if submission failed
      setMessage(trimmedMessage);
    }
  };

  return (
    <div className="border-t border-gray-300 bg-gray-100 p-4">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message here..."
          className="flex-grow rounded-lg border border-gray-300 p-2 focus:outline-none focus:ring focus:ring-blue-300"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !message.trim()}
          className={`flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 p-2 text-white
            ${isLoading ? 'cursor-not-allowed opacity-50' : 'hover:bg-blue-600'}`}
        >
          {isLoading ? <Loader2 className="animate-spin" /> : '→'}
        </button>
      </form>
    </div>
  );
}

export default ChatInput;
