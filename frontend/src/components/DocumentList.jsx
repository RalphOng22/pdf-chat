import React from 'react';
import { FileText, Check } from 'lucide-react';

const DocumentList = ({ documents, selectedDocs, onSelect, onViewPDF }) => {
  return (
    <div className="flex flex-col space-y-2 p-4">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg group"
        >
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={selectedDocs.includes(doc.id)}
              onChange={() => onSelect(doc.id)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <FileText className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-700 truncate">{doc.filename}</span>
          </div>
          <button
            onClick={() => onViewPDF(doc)}
            className="opacity-0 group-hover:opacity-100 text-sm text-blue-600 hover:text-blue-700"
          >
            View
          </button>
        </div>
      ))}
    </div>
  );
};

export default DocumentList;