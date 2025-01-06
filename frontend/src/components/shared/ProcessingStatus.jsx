import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase.js';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const ProcessingStatus = ({ documents }) => {
  const [documentStatuses, setDocumentStatuses] = useState({});

  useEffect(() => {
    // Initialize statuses
    const initialStatuses = documents.reduce((acc, doc) => ({
      ...acc,
      [doc.id]: doc.processing_status
    }), {});
    setDocumentStatuses(initialStatuses);

    // Subscribe to document status changes
    const channel = supabase
      .channel('document_status_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'documents',
          filter: `id=in.(${documents.map(d => d.id).join(',')})`,
        },
        (payload) => {
          setDocumentStatuses(current => ({
            ...current,
            [payload.new.id]: payload.new.processing_status
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [documents]);

  const getStatusDisplay = (status) => {
    switch (status) {
      case 'pending':
        return {
          icon: <AlertCircle className="w-5 h-5 text-yellow-500" />,
          text: 'Pending',
          className: 'text-yellow-500'
        };
      case 'processing':
        return {
          icon: <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />,
          text: 'Processing',
          className: 'text-blue-500'
        };
      case 'completed':
        return {
          icon: <CheckCircle className="w-5 h-5 text-green-500" />,
          text: 'Completed',
          className: 'text-green-500'
        };
      case 'failed':
        return {
          icon: <XCircle className="w-5 h-5 text-red-500" />,
          text: 'Failed',
          className: 'text-red-500'
        };
      default:
        return {
          icon: <AlertCircle className="w-5 h-5 text-gray-500" />,
          text: 'Unknown',
          className: 'text-gray-500'
        };
    }
  };

  return (
    <div className="space-y-2">
      {documents.map((doc) => {
        const status = documentStatuses[doc.id] || 'pending';
        const statusDisplay = getStatusDisplay(status);

        return (
          <div 
            key={doc.id}
            className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm"
          >
            <div className="flex items-center space-x-3">
              {statusDisplay.icon}
              <span className="font-medium">{doc.name}</span>
            </div>
            <span className={`text-sm ${statusDisplay.className}`}>
              {statusDisplay.text}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default ProcessingStatus;