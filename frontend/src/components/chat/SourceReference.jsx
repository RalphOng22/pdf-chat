export function SourceReference({ documentName, pageNumber, text, onClick }) {
    return (
      <div
        onClick={onClick}
        className="mt-2 cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm hover:bg-gray-100"
      >
        <div className="flex items-center justify-between text-gray-500">
          <span className="font-medium">{documentName}</span>
          <span>Page {pageNumber}</span>
        </div>
        <p className="mt-1 text-gray-700">{text}</p>
      </div>
    );
  }
  