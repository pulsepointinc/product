'use client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp: string;
}

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-3xl rounded-lg p-4 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-800 shadow-sm border'
        }`}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
        
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="text-xs font-semibold mb-1">Sources:</div>
            <div className="flex flex-wrap gap-2">
              {message.sources.map((source, idx) => (
                <span
                  key={idx}
                  className="text-xs px-2 py-1 bg-gray-100 rounded"
                >
                  {source}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

