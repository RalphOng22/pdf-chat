import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { supabase } from '../services/supabase.js';
import * as pdfjsLib from 'pdfjs-dist';
import { Upload, X, FileText, Loader } from 'lucide-react';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const UploadPDF = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, fileName: '' });

  const createNewChat = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No authenticated session found');

      const response = await fetch(`${supabase.functionsUrl}/chat-creator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create chat');
      }

      const { chatId } = await response.json();
      return chatId;
    } catch (error) {
      console.error('Error creating chat:', error);
      throw error;
    }
  };

  const extractTextFromPDF = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      const numPages = pdf.numPages;
      const textByPage = [];
  
      // First, extract text page by page
      for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => item.str)
          .join(' ')
          .trim();
        
        if (text) {
          textByPage.push({
            pageNumber,
            text
          });
        }
      }
  
      // Then chunk each page's text while maintaining page reference
      const chunksWithPages = [];
      for (const { pageNumber, text } of textByPage) {
        const pageChunks = chunkText(text).map(chunk => ({
          text: chunk,
          page_number: pageNumber
        }));
        chunksWithPages.push(...pageChunks);
      }
  
      return {
        chunks: chunksWithPages,
        totalPages: numPages
      };
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw new Error(`Failed to extract text from ${file.name}: ${error.message}`);
    }
  };

  const chunkText = (text, maxChunkSize = 500) => {
    const chunks = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';
  
    for (const sentence of sentences) {
      // If adding this sentence would exceed maxChunkSize
      if ((currentChunk + sentence).length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      currentChunk += sentence + ' ';
    }
  
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
  
    return chunks;
  };

  const validateAndAddFile = (selectedFile) => {
    if (!selectedFile || selectedFile.type !== 'application/pdf') {
      toast.error('Please upload a valid PDF file.');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10 MB.');
      return;
    }

    if (files.some(f => f.name === selectedFile.name)) {
      toast.error('This file has already been selected.');
      return;
    }

    setFiles(prev => [...prev, selectedFile]);
    toast.success('PDF file added successfully!');
  };

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    validateAndAddFile(droppedFile);
  }, [files]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    validateAndAddFile(selectedFile);
  };

  const removeFile = (fileName) => {
    setFiles(files.filter(file => file.name !== fileName));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Please select at least one PDF file.');
      return;
    }
  
    setLoading(true);
    setProgress({ current: 0, total: files.length, fileName: '' });
  
    try {
      const chatId = await createNewChat();
      if (!chatId) {
        throw new Error('Failed to create chat');
      }
  
      let successCount = 0;
  
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`Processing file ${i + 1}/${files.length}:`, {
          name: file.name,
          size: file.size,
          type: file.type
        });
  
        setProgress(prev => ({
          ...prev,
          current: i + 1,
          fileName: file.name,
        }));
  
        try {
          // Validate file name for storage
          const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const filePath = `pdfs/${chatId}/${sanitizedFileName}`;
          
          console.log('Attempting storage upload with:', {
            bucket: 'pdfs',
            filePath,
            fileSize: file.size,
            fileType: file.type
          });
  
          // Upload file to storage with detailed error logging
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('pdfs')
            .upload(filePath, file, {
              cacheControl: '3600',
              upsert: false
            });
  
          if (uploadError) {
            console.error('Storage upload error details:', {
              error: uploadError,
              statusCode: uploadError.statusCode,
              message: uploadError.message,
              details: uploadError.details
            });
            throw new Error(`Storage upload failed for ${file.name}: ${uploadError.message}`);
          }
  
          console.log('File uploaded successfully:', uploadData);
  
          // Process PDF with improved extraction
          console.log('Starting PDF text extraction...');
          const { chunks: textChunksWithPages, totalPages } = await extractTextFromPDF(file);
          console.log('PDF extraction completed:', {
            totalPages,
            chunksCount: textChunksWithPages.length
          });
  
          // Send to embedding generator
          const { data: sessionData } = await supabase.auth.getSession();
          console.log('Sending to embedding generator:', {
            fileName: sanitizedFileName,
            filePath,
            chunksCount: textChunksWithPages.length
          });
  
          const response = await fetch(`${supabase.functionsUrl}/embedding-generator`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({
              fileName: sanitizedFileName,
              filePath,
              textChunks: textChunksWithPages,
              chatId,
              totalPages,
            }),
          });
  
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Embedding generator failed for ${file.name}: ${errorData.error || 'Unknown error'}`);
          }
  
          console.log('Embedding generation completed successfully');
          successCount++;
  
        } catch (error) {
          console.error(`Detailed error processing file ${file.name}:`, {
            error,
            stack: error.stack,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type
          });
          toast.error(`Failed to process ${file.name}: ${error.message}`);
        }
      }
  
      // Handle completion
      if (successCount === files.length) {
        toast.success('All PDFs uploaded and processed successfully!');
        navigate(`/chat/${chatId}`);
      } else if (successCount > 0) {
        toast.warning(`Successfully processed ${successCount} out of ${files.length} files`);
        navigate(`/chat/${chatId}`);
      } else {
        toast.error('Failed to process any files');
      }
  
      setFiles([]);
    } catch (error) {
      console.error('General upload error:', {
        error,
        stack: error.stack,
        context: 'handleUpload main try-catch'
      });
      toast.error(`Upload error: ${error.message || 'Unknown error occurred'}`);
    } finally {
      setLoading(false);
      setProgress({ current: 0, total: 0, fileName: '' });
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h1 className="text-3xl font-medium text-gray-900 mb-8">Upload Your PDF</h1>

      <div
        className={`w-full relative rounded-lg ${
          isDragging
            ? 'bg-gray-50 border-2 border-dashed border-blue-500'
            : 'bg-white border-2 border-dashed border-gray-300'
        } transition-colors duration-200 ease-in-out`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div className="flex flex-col items-center justify-center py-16">
          <Upload className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-lg text-gray-900 mb-1">Drag & drop your PDF here</p>
          <p className="text-sm text-gray-500">or click to browse</p>
        </div>
      </div>

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

          {loading && progress.fileName && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-blue-700">Processing: {progress.fileName}</span>
                <span className="text-sm text-blue-700">
                  {progress.current} of {progress.total}
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={loading}
            className={`w-full mt-4 px-6 py-3 rounded-lg text-white font-medium transition-colors ${
              loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {loading ? (
              <div className="flex items-center justify-center space-x-2">
                <Loader className="w-5 h-5 animate-spin" />
                <span>Processing...</span>
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
