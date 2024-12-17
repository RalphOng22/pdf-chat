import React from 'react';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

const PDFPreview = ({ document, isSelected, onSelect, onView }) => {
    return (
      <div className="p-4 border-b hover:bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onSelect}
              className="rounded border-gray-300"
            />
            <h3 className="font-medium text-gray-800 truncate">{document.name}</h3>
          </div>
          <button
            onClick={onView}
            className="p-1 hover:bg-gray-100 rounded-lg text-blue-600"
          >
            View
          </button>
        </div>
        <div className="text-sm text-gray-500">
          {document.page_count} pages • Uploaded {new Date(document.upload_date).toLocaleDateString()}
        </div>
      </div>
    );
  };

  export default PDFPreview;