import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { supabase, supabaseService } from '../services/supabase.js';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import ProcessingStatus from '../components/shared/ProcessingStatus.jsx';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const UploadPDF = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);

  const validateFile = (file) => {
    if (!file || !file.type || file.type !== 'application/pdf') {
      toast.error('Please upload a valid PDF file.');
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size must be less than 10 MB.');
      return false;
    }

    if (files.some(f => f.name === file.name)) {
      toast.error('This file has already been selected.');
      return false;
    }

    return true;
  };

  const handleUpload = async () => {
    console.log('Uploading files:', files);
    if (files.length === 0) {
      toast.error('Please select at least one PDF file.');
      return;
    }
  
    setLoading(true);
    try {
      // Get session
      const { data: { session } } = await supabase.auth.getSession();
      console.log('Active session:', session);
      if (!session) throw new Error('No active session');
  
      // Create chat first
      const { data: chat, error: chatError } = await supabaseService.createChat({
        user_id: session.user.id,
        title: files.length === 1 ? files[0].name : 'Multiple PDFs Chat'
      });
      console.log('Chat created:', chat);
  
      if (chatError) throw chatError;
      setCurrentChatId(chat.id);
  
      // Upload documents
      const { documents } = await supabaseService.uploadDocuments(files, chat.id, session);
      if (!documents?.length) throw new Error('No documents were uploaded');
      
      setUploadedDocs(documents.map(doc => ({
        id: doc.documentId,
        name: doc.filename,
        processing_status: 'pending'
      })));
  
      // Start processing
      const processResult = await supabaseService.processDocuments(
        chat.id,
        documents.map(doc => doc.documentId),
        session
      );
  
      console.log('Processing started:', processResult);
      
      toast.success('Files uploaded and processing started');
      navigate(`/chat/${chat.id}`);
  
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(`Upload failed: ${error.message}`);
      // Clean up if needed
      if (currentChatId) {
        await supabaseService.deleteChat(currentChatId);
      }
      setCurrentChatId(null);
      setUploadedDocs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFile = e.dataTransfer.files[0];
    if (validateFile(droppedFile)) {
      setFiles(prev => [...prev, droppedFile]);
      toast.success('PDF added successfully!');
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (validateFile(selectedFile)) {
      setFiles(prev => [...prev, selectedFile]);
      toast.success('PDF added successfully!');
    }
  };

  const removeFile = (fileName) => {
    setFiles(files.filter(file => file.name !== fileName));
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h1 className="text-3xl font-medium text-gray-900 mb-8">Upload Your PDFs</h1>

      {/* Processing Status */}
      {currentChatId && uploadedDocs.length > 0 && (
        <div className="mb-6">
          <ProcessingStatus
            chatId={currentChatId}
            documents={uploadedDocs.map(doc => ({
              id: doc.documentId,
              name: doc.filename,
              processing_status: 'processing'
            }))}
          />
        </div>
      )}

      {/* Drop Zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="w-full relative rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-500 transition-colors"
      >
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div className="flex flex-col items-center justify-center py-16">
          <Upload className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-lg text-gray-900 mb-1">Drag & drop your PDFs here</p>
          <p className="text-sm text-gray-500">or click to browse</p>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          {files.map((file) => (
            <div
              key={file.name}
              className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4"
            >
              <div className="flex items-center space-x-3">
                <FileText className="w-6 h-6 text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeFile(file.name)}
                className="p-1 hover:bg-gray-100 rounded-full"
                disabled={loading}
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          ))}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={loading}
            className={`w-full mt-4 px-6 py-3 rounded-lg text-white font-medium transition-colors
              ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'}`}
          >
            {loading ? (
              <div className="flex items-center justify-center space-x-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Uploading...</span>
              </div>
            ) : (
              `Upload ${files.length} PDF${files.length > 1 ? 's' : ''}`
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default UploadPDF;