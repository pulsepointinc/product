'use client';

import { useState, useEffect } from 'react';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { useGoogleAuth } from '../lib/auth';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { user, isAuthenticated, signIn, signOut } = useGoogleAuth();
  const SSO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SSO === 'true';

  useEffect(() => {
    // Generate session ID on mount
    setSessionId(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  }, []);

  const handleSend = async (question: string) => {
    if (!question.trim()) return;
    // Only require authentication if SSO is enabled
    if (SSO_ENABLED && !isAuthenticated) return;

    // Add user message
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      // Get auth token (only if SSO enabled)
      const token = SSO_ENABLED ? await user?.getIdToken() : null;
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Use full API URL if provided, otherwise use relative path
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const endpoint = apiUrl ? `${apiUrl}/api/chat/ask` : '/api/chat/ask';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question,
          session_id: sessionId,
          conversation_history: messages.slice(-5).map(m => ({
            role: m.role,
            content: m.content
          })),
          max_results: 50
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      const synthesisResponse = data.synthesis_response || data;

      // Add assistant message
      const assistantMessage: Message = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: synthesisResponse.response || 'No response',
        sources: synthesisResponse.sources || [],
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Only show login screen if SSO is enabled
  if (SSO_ENABLED && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Product GPT Chat</h1>
          <p className="text-gray-600 mb-6">Sign in with your PulsePoint account to continue</p>
          <button
            onClick={signIn}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Product GPT Chat</h1>
          <div className="flex items-center gap-4">
            {SSO_ENABLED && user && (
              <span className="text-sm text-gray-600">{user.email}</span>
            )}
            {SSO_ENABLED && (
              <button
                onClick={signOut}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <main className="flex-1 overflow-y-auto max-w-4xl w-full mx-auto px-4 py-6">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-12">
              <p className="text-lg mb-2">Welcome to Product GPT Chat!</p>
              <p>Ask me anything about PulsePoint products, roadmaps, or documentation.</p>
            </div>
          )}
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Chat Input */}
      <footer className="bg-white border-t">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <ChatInput onSend={handleSend} disabled={loading} />
        </div>
      </footer>
    </div>
  );
}

