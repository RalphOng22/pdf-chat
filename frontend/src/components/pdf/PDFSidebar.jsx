import React from 'react';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import PDFPreview from './PDFPreview.jsx';
import { X } from 'lucide-react';


const PDFSidebar = ({ documents, selectedDocs, onSelect, onViewPDF, onClose }) => {
    const isAllSelected = selectedDocs.includes('all');

    return (
      <div className="h-full flex flex-col bg-white">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-gray-800">Reference Documents</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        <div className="p-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 mb-4">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={() => onSelect('all')}
              className="rounded border-gray-300"
            />
            Select All Documents
          </label>
        </div>
        <div className="flex-1 overflow-y-auto">
          {documents.map((doc) => (
            <PDFPreview
              key={doc.id}
              document={doc}
              isSelected={isAllSelected || selectedDocs.includes(doc.id)}
              onSelect={() => onSelect(doc.id)}
              onView={() => onViewPDF(doc)}
            />
          ))}
        </div>
      </div>
    );
  };

export default PDFSidebar;