import React from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog.jsx';
import { Trash2 } from 'lucide-react';

const DeleteChatDialog = ({ onDelete, chatTitle }) => {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button className="ml-2 p-1 rounded-lg hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-400" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-[#1a1f2b] border-gray-700">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Delete Chat</AlertDialogTitle>
          <AlertDialogDescription className="text-gray-400">
            Are you sure you want to delete this chat?
            {chatTitle && (
              <div className="mt-2 p-2 bg-gray-800 rounded-md text-gray-300">
                "{chatTitle}"
              </div>
            )}
            <div className="mt-2 text-sm text-red-400">
              This action cannot be undone. All messages and document references will be permanently deleted.
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border-gray-600">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onDelete}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteChatDialog;