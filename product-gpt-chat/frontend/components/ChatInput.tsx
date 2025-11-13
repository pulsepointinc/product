'use client';

import { useState, FormEvent } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask a question about PulsePoint products, roadmaps, or documentation..."
        disabled={disabled}
        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 text-sm"
      />
      <button
        type="submit"
        disabled={disabled || !input.trim()}
        className="px-6 py-3 text-white rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
        style={{ 
          backgroundColor: disabled || !input.trim() ? undefined : '#6B46C1',
          ...(disabled || !input.trim() ? {} : { ':hover': { backgroundColor: '#5B21B6' } })
        }}
        onMouseEnter={(e) => {
          if (!disabled && input.trim()) {
            e.currentTarget.style.backgroundColor = '#5B21B6';
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && input.trim()) {
            e.currentTarget.style.backgroundColor = '#6B46C1';
          }
        }}
      >
        Send
      </button>
    </form>
  );
}

