import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { supabaseService } from '../../services/supabase.js';

const ProcessingStatus = ({ chatId, documents }) => {
  const [statuses, setStatuses] = useState(
    documents.map(doc => ({
      ...doc,
      error: null,
      retries: 0,
      processing_status: doc.processing_status || 'pending'
    }))
  );

  useEffect(() => {
    // Subscribe to document status updates
    const subscription = supabaseService.subscribeToDocumentUpdates(
      chatId,
      (payload) => {
        setStatuses(current => 
          current.map(doc => {
            if (doc.id === payload.new.id) {
              return {
                ...doc,
                processing_status: payload.new.processing_status,
                error: payload.new.error || null
              };
            }
            return doc;
          })
        );
      }
    );

    // Initial fetch of document statuses
    const fetchInitialStatuses = async () => {
      try {
        const { data, error } = await supabaseService.getChatDocuments(chatId);
        if (error) throw error;

        setStatuses(current => 
          current.map(doc => {
            const updatedDoc = data.find(d => d.id === doc.id);
            return updatedDoc ? { ...doc, ...updatedDoc } : doc;
          })
        );
      } catch (error) {
        console.error('Error fetching document statuses:', error);
      }
    };

    fetchInitialStatuses();

    // Cleanup subscription
    return () => {
      subscription?.unsubscribe();
    };
  }, [chatId]);

  const getStatusIcon = (status, error) => {
    if (error) {
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
      default:
        return <Loader2 className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = (status, error) => {
    if (error) return 'Failed';
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'processing':
        return 'Processing...';
      case 'pending':
        return 'Pending';
      default:
        return status;
    }
  };

  const getStatusColor = (status, error) => {
    if (error) return 'text-red-600';
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'processing':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-3 bg-white rounded-lg p-4 border border-gray-200">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Processing Status</h3>
      {statuses.map((doc) => (
        <div 
          key={`${doc.id}-${doc.name}`}
          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">
              {doc.name}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {getStatusIcon(doc.processing_status, doc.error)}
              <p className={`text-sm ${getStatusColor(doc.processing_status, doc.error)}`}>
                {getStatusText(doc.processing_status, doc.error)}
              </p>
            </div>
            {doc.error && (
              <p className="text-xs text-red-500 mt-1">
                Error: {doc.error}
              </p>
            )}
          </div>
          
          {doc.processing_status === 'processing' && (
            <div className="ml-4 flex-shrink-0">
              <div className="h-2 w-24 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full animate-pulse"
                  style={{ width: '60%' }}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ProcessingStatus;