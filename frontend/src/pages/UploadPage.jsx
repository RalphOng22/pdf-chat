import React from 'react';
import Sidebar from '../components/sidebar/Sidebar.jsx';
import UploadPDF from '../components/UploadPDF.jsx';

const UploadPage = () => {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 bg-[#f8f9fb]">
        <div className="h-full w-full flex items-center justify-center">
          <div className="w-full max-w-3xl px-8">
            <UploadPDF />
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;