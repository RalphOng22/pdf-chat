import React, { useState, useEffect } from 'react';
import { FileText, X, Menu } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../services/supabase.js';
import DocumentList from '../DocumentList.jsx';
import PDFViewer from '../pdf/PDFViewer.jsx';
import PDFSidebar from '../pdf/PDFSidebar.jsx';
import Sidebar from '../sidebar/Sidebar.jsx';
import ChatContainer from '../chat/ChatContainer.jsx';
import { toast } from 'react-toastify';

const ChatLayout = () => {
  const { chatId } = useParams();
  const [showSidebar, setShowSidebar] = useState(false);
  const [showPDFViewer, setShowPDFViewer] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState(['all']);
  const [currentPDF, setCurrentPDF] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chatTitle, setChatTitle] = useState('New Chat');

  useEffect(() => {
    const channel = supabase
      .channel('chat_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chats',
          filter: `id=eq.${chatId}`,
        },
        (payload) => {
          if (payload.new.title) {
            setChatTitle(payload.new.title);
          }
        }
      )
      .subscribe();
  
    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId]);

  // Fetch documents and chat data
  useEffect(() => {
    
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Only fetch documents for this specific chat
        const { data: docs, error: docsError } = await supabase
          .from('documents')
          .select('*')
          .eq('chat_id', chatId);
          
        if (docsError) throw docsError;
        setDocuments(docs || []);
        // Set default selection to all documents in this chat
        setSelectedDocs(['all']);

        // Fetch chat details
        const { data: chat, error: chatError } = await supabase
          .from('chats')
          .select('title')
          .eq('id', chatId)
          .single();

        if (chatError) throw chatError;
        if (chat?.title) setChatTitle(chat.title);

      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (chatId) {
      fetchData();
    }
  }, [chatId]);

  // Handle mouse movement for sidebar with debounce
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (e.clientX <= 10) { // Trigger zone at the very left edge
        setShowSidebar(true);
      } else if (e.clientX > 300) { // Hide when mouse moves away from sidebar
        setShowSidebar(false);
      }
    };
  
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const handleDocumentSelect = (docId) => {
    setSelectedDocs(prev => {
      if (docId === 'all') {
        return ['all'];
      }
      const newSelection = prev.filter(id => id !== 'all');
      if (prev.includes(docId)) {
        const filtered = newSelection.filter(id => id !== docId);
        return filtered.length ? filtered : ['all'];
      } else {
        return [...newSelection, docId];
      }
    });
  };


  const handleViewPDF = async (doc) => {
    try {
      // Get the signed URL for the PDF
      const { data: { signedUrl }, error } = await supabase.storage
        .from('pdfs')
        .createSignedUrl(doc.file_path, 3600); // URL valid for 1 hour
  
      if (error) throw error;
  
      setCurrentPDF({
        ...doc,
        url: signedUrl
      });
      setShowPDFViewer(true);
    } catch (error) {
      console.error('Error getting PDF URL:', error);
      toast.error('Failed to load PDF');
    }
  };

  const handleSourceClick = async (source) => {
    console.log('Received source in ChatLayout:', source);
    try {
      // Find the document from your documents state
      let document = documents.find((doc) => 
        doc.id === source.documentId && doc.chat_id === chatId
      );
      
      // Fallback to finding by name within current chat
      if (!document) {
        document = documents.find((doc) => 
          doc.name === source.documentName && doc.chat_id === chatId
        );
      }
      // Get the signed URL for the PDF
      const { data: { signedUrl }, error } = await supabase.storage
        .from('pdfs')
        .createSignedUrl(document.file_path, 3600); // URL valid for 1 hour
  
      if (error) throw error;
  
      // Set the current PDF with the page number
      const newPDF = {
        ...document,
        url: signedUrl,
        initialPage: parseInt(source.pageNumber)
      };
      console.log('Setting currentPDF:', newPDF); // Add this
      setCurrentPDF(newPDF);
    
      // Show the PDF viewer
      setShowPDFViewer(true);
    } catch (error) {
      console.error('Error getting PDF URL:', error);
      toast.error('Failed to load PDF');
    }
  };
  
  

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar with new hover/click behavior */}
      <div
        className={`fixed left-0 top-0 h-full w-64 bg-white shadow-lg transition-all duration-300 z-50 ${
          showSidebar 
            ? 'translate-x-0 opacity-100 pointer-events-auto' 
            : '-translate-x-full opacity-0 pointer-events-none'
        }`}
      >
        <Sidebar chatId={chatId} />
      </div>
  
      {/* Main Chat Area */}
      <div
        className={`flex-1 flex flex-col h-screen transition-all duration-300 ${
          showPDFViewer ? 'mr-[400px]' : ''
        }`}
      >
        {/* Chat Header */}
        <div className="h-16 min-h-[4rem] border-b flex items-center justify-between px-6 bg-white">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-xl font-semibold text-gray-800">
              {isLoading ? 'Loading...' : chatTitle}
            </h1>
          </div>
          <button
            onClick={() => setShowPDFViewer(!showPDFViewer)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <FileText className="w-5 h-5 text-gray-600" />
          </button>
        </div>
  
        {/* Chat Container with flex-1 to take remaining space */}
        <div className="flex-1 overflow-hidden">
          <ChatContainer 
            chatId={chatId}
            onSourceClick={handleSourceClick}
            selectedDocuments={selectedDocs.includes('all') 
              ? documents.map(doc => doc.id) 
              : selectedDocs}
          />
        </div>
      </div>
  
      {/* PDF Section */}
      <div 
        className={`fixed right-0 top-0 w-[400px] h-full z-40 transition-transform duration-300 ${
          showPDFViewer ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {currentPDF ? (
          <PDFViewer
            url={currentPDF.url}
            filename={currentPDF.name}
            initialPage={currentPDF.initialPage}
            onClose={() => setShowPDFViewer(false)}
            onBack={() => {
              setCurrentPDF(null);
            }}
          />
        ) : (
          <PDFSidebar
            documents={documents}
            selectedDocs={selectedDocs}
            onSelect={handleDocumentSelect}
            onViewPDF={handleViewPDF}
            onClose={() => setShowPDFViewer(false)}
          />
        )}
      </div>
    </div>
  );
};


export default ChatLayout;