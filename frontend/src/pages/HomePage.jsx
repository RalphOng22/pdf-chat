import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Plus, MessageSquare, Search } from 'lucide-react';
import Sidebar from '../components/sidebar/Sidebar.jsx';

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        {/* Main Content */}
        <div className="flex-1 p-8 flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
          <div className="text-center space-y-6">
            <FileText className="w-16 h-16 text-blue-500 mx-auto" />
            <h1 className="text-4xl font-bold text-gray-900">
              Welcome to PDF Chatbot
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl">
              Upload your PDFs and start interactive conversations with your documents. 
              Our AI will help you extract insights and answer questions. Let's get started.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
              <button
                onClick={() => navigate('/upload')}
                className="flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl"
              >
                <Upload className="w-5 h-5" />
                <span>Upload PDF</span>
              </button>
              {/* <button
                onClick={() => navigate('/chat')}
                className="flex items-center justify-center space-x-2 px-6 py-3 bg-white text-gray-800 rounded-lg hover:bg-gray-50 transition-colors border border-gray-200 shadow-lg hover:shadow-xl"
              >
                <Plus className="w-5 h-5" />
                <span>New Chat</span>
              </button> */}
            </div>
          </div>

          {/* Features Section */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
            {features.map((feature, index) => (
              <div
                key={index}
                className="p-6 bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow"
              >
                <feature.icon className="w-8 h-8 text-blue-500 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const features = [
  {
    icon: FileText,
    title: "PDF Processing",
    description: "Upload and process any PDF document with advanced text extraction."
  },
  {
    icon: MessageSquare,
    title: "Interactive Chat",
    description: "Have natural conversations with your documents using AI."
  },
  {
    icon: Search,
    title: "Smart Search",
    description: "Quickly find information across all your uploaded documents."
  }
];

export default HomePage;
