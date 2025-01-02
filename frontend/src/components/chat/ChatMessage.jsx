import { SourceReference } from './SourceReference.jsx';
import { useState } from 'react';
import { User } from 'lucide-react';


export function ChatMessage({ isUser, message, sources = [], onSourceClick }) {
    const [expanded, setExpanded] = useState(false);
  
    const toggleExpanded = () => {
      setExpanded((prev) => !prev);
    };
  
    const handleSourceClick = (source) => {
      console.log('Source clicked:', source);
      onSourceClick?.({
        documentId: source.document_id,
        pageNumber: source.page_number,
        documentName: source.document_name,
      });
    };
  
    return (
      <div className={`py-4 ${isUser ? 'bg-white' : 'bg-gray-50'}`}>
        <div className="mx-auto max-w-4xl">
          <div className="flex items-start gap-4 px-4">
            <div className={`rounded-full p-2 ${
                isUser ? 'bg-blue-500' : 'bg-slate-300'
            } flex items-center justify-center`}>
                {isUser ? (
                <User className="w-5 h-5 text-white" />
                ) : (
                <img 
                    src="/google-gemini-icon.png" // Make sure to add this image to your public folder
                    alt="Gemini"
                    className="w-5 h-5"
                />
                )}
            </div>
            <div className="flex-1">
              <div className="prose max-w-none">
                <p>{message}</p>
              </div>
              {sources.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div
                    className="cursor-pointer text-sm text-blue-500 hover:underline"
                    onClick={toggleExpanded}
                  >
                    {expanded ? 'Hide Sources ▲' : 'Show Sources ▼'}
                  </div>
                  {expanded &&
                    sources.map((source, index) => (
                      <SourceReference
                        key={`${source.document_id}-${source.page_number}-${index}`}
                        documentName={source.document_name}
                        pageNumber={source.page_number}
                        text={source.text}
                        onClick={() => handleSourceClick(source)}
                      />
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
