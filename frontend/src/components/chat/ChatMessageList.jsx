import { useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage.jsx';

export function ChatMessageList({ messages, onSourceClick }) {
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.map((message) => (
        <ChatMessage
          key={`${message.id}-${Date.now()}`}
          isUser={message.isUser}
          message={message.message}
          sources={message.sources}
          onSourceClick={onSourceClick}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
