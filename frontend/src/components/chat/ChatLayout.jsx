import React, { useState, useEffect } from 'react';
import { FileText, X, Menu } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../services/supabase.js';
import ProcessingStatus from '../shared/ProcessingStatus.jsx';
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

  // Subscribe to chat title updates
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
        
        // Fetch documents for this chat
        const { data: docs, error: docsError } = await supabase
          .from('documents')
          .select('*')
          .eq('chat_id', chatId);
          
        if (docsError) throw docsError;
        setDocuments(docs || []);
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
        toast.error('Failed to load chat data');
      } finally {
        setIsLoading(false);
      }
    };

    if (chatId) {
      fetchData();
    }
  }, [chatId]);

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
      const { data: { signedUrl }, error } = await supabase.storage
        .from('pdfs')
        .createSignedUrl(doc.file_path, 3600);
  
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
    try {
      const document = documents.find(doc => 
        doc.id === source.documentId || doc.name === source.documentName
      );
      
      if (!document) throw new Error('Document not found');

      const { data: { signedUrl }, error } = await supabase.storage
        .from('pdfs')
        .createSignedUrl(document.file_path, 3600);
  
      if (error) throw error;
  
      setCurrentPDF({
        ...document,
        url: signedUrl,
        initialPage: parseInt(source.pageNumber)
      });
      setShowPDFViewer(true);
    } catch (error) {
      console.error('Error getting PDF URL:', error);
      toast.error('Failed to load PDF');
    }
  };

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Left Sidebar */}
      <div
        className={`fixed left-0 top-0 h-full w-64 bg-white shadow-lg transition-all duration-300 z-50 ${
          showSidebar ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar chatId={chatId} />
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col h-screen transition-all duration-300 ${
        showPDFViewer ? 'mr-[400px]' : ''
      }`}>
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

        {/* Processing Status */}
        <div className="px-6 pt-4">
          <ProcessingStatus 
            chatId={chatId}
            documents={documents.filter(doc => 
              doc.processing_status === 'processing' || 
              doc.processing_status === 'pending'
            )}
          />
        </div>

        {/* Chat Container */}
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
      <div className={`fixed right-0 top-0 w-[400px] h-full z-40 transition-transform duration-300 ${
        showPDFViewer ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {currentPDF ? (
          <PDFViewer
            url={currentPDF.url}
            filename={currentPDF.name}
            initialPage={currentPDF.initialPage}
            onClose={() => setShowPDFViewer(false)}
            onBack={() => setCurrentPDF(null)}
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