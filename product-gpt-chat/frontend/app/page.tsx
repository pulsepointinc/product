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
      
      // Use backend API URL - check both runtime env and fallback to hardcoded
      const apiUrl = (typeof window !== 'undefined' && (window as any).__NEXT_DATA__?.env?.NEXT_PUBLIC_API_URL) 
        || process.env.NEXT_PUBLIC_API_URL 
        || 'https://product-gpt-chat-api-420423430685.us-east4.run.app';
      const endpoint = `${apiUrl}/api/chat/ask`;
      
      console.log('Calling API:', endpoint);
      console.log('Request payload:', { question, session_id: sessionId });
      
      // Create AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 seconds

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
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('API Response:', data);
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
    } catch (error: any) {
      console.error('Error:', error);
      let errorContent = 'Sorry, I encountered an error. Please try again.';
      
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        errorContent = 'The request took too long to process. This might be due to a complex query. Please try rephrasing your question or breaking it into smaller parts.';
      } else if (error.message?.includes('504') || error.message?.includes('timeout')) {
        errorContent = 'The server took too long to respond. Please try again with a simpler question.';
      }
      
      const errorMessage: Message = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: errorContent,
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

