import React from 'react';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import { Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { X, ChevronLeft } from 'lucide-react';

const PDFViewer = ({ url, onClose, filename, onBack, initialPage = 1 }) => {
    console.log('PDFViewer received props:', { url, filename, initialPage });
    const defaultLayoutPluginInstance = defaultLayoutPlugin({
        // Configure the plugin to jump to the initial page
        defaultScale: 1,
        initialPage: initialPage - 1 // PDF viewer uses 0-based indexing
      });

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h3 className="font-medium text-gray-800 truncate">{filename}</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-lg"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
          <Viewer
            fileUrl={url}
            plugins={[defaultLayoutPluginInstance]}
            initialPage={initialPage - 1}
            onDocumentLoadFailed={(error) => {
              console.error('Error loading document:', error);
            }}
          />
        </Worker>
      </div>
    </div>
  );
};

export default PDFViewer;