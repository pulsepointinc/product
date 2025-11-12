'use client';

import { useState, useEffect, useCallback } from 'react';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import ConversationSidebar from '../components/ConversationSidebar';
import { useGoogleAuth } from '../lib/auth';
import {
  createConversation,
  getConversationMessages,
  addMessage,
  updateConversationTitle,
  deleteConversation,
  ChatMessage as FirestoreMessage
} from '../lib/firestore';

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
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const { user, isAuthenticated, signIn, signOut, loading: authLoading } = useGoogleAuth();
  const SSO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SSO === 'true';

  // Create new conversation - just clear current state, don't create until user sends message
  const handleNewConversation = useCallback(async () => {
    if (!isAuthenticated || !user?.uid) return;

    // If current conversation is empty (no messages), just stay there - don't create a new one
    if (messages.length === 0) {
      console.log('Current conversation is empty, staying in place');
      // If there's a conversation ID but no messages, delete it to prevent empty conversations
      if (currentConversationId && !currentConversationId.startsWith('temp_')) {
        console.log('Deleting empty conversation:', currentConversationId);
        deleteConversation(currentConversationId).catch(err => {
          console.error('Error deleting empty conversation:', err);
        });
        setCurrentConversationId(null);
      }
      return;
    }

    // Save current conversation messages before clearing (truly async - don't block)
    const messagesToSave = messages;
    const conversationIdToSave = currentConversationId;

    // Clear messages and conversation ID immediately
    setMessages([]);
    setCurrentConversationId(null);

    // Save current conversation messages before clearing (truly async - don't block)
    if (conversationIdToSave && messagesToSave.length > 0) {
      // Save messages in background - don't await or block UI
      messagesToSave.forEach((msg) => {
        addMessage(conversationIdToSave, {
          role: msg.role,
          content: msg.content,
          sources: msg.sources
        }).catch(err => {
          console.error('Error saving message:', err);
        });
      });
      
      // Trigger sidebar refresh after saving messages
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          window.dispatchEvent(new Event('conversationCreated'));
        }, 500);
      }
    }
    
    // Don't create a new conversation here - wait until user sends first message
    // This prevents empty conversations from being created
  }, [isAuthenticated, user?.uid, currentConversationId, messages]);

  // Load conversation messages
  const loadConversation = useCallback(async (conversationId: string) => {
    // Don't reload if we're already viewing this conversation
    if (currentConversationId === conversationId && messages.length > 0) {
      console.log('Already viewing this conversation, skipping reload');
      return;
    }
    
    setLoadingConversation(true);
    try {
      // Clear existing messages first to prevent duplication
      setMessages([]);
      const firestoreMessages = await getConversationMessages(conversationId);
      const formattedMessages: Message[] = firestoreMessages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        sources: msg.sources,
        timestamp: msg.timestamp.toISOString()
      }));
      // Use functional update to ensure we're setting fresh messages
      setMessages(() => formattedMessages);
      setCurrentConversationId(conversationId);
    } catch (error) {
      console.error('Error loading conversation:', error);
      alert('Failed to load conversation');
      // Ensure messages are cleared even on error
      setMessages([]);
    } finally {
      setLoadingConversation(false);
    }
  }, [currentConversationId, messages.length]);

  // Don't auto-create conversation on mount - only create when user sends first message
  // This prevents creating empty conversations on refresh
  
  // Clear messages on mount to prevent duplication on refresh
  useEffect(() => {
    // On initial mount, ensure messages are cleared and no conversation is selected
    // This prevents any stale state from causing issues
    setMessages([]);
    setCurrentConversationId(null);
    console.log('🔄 Page mounted/refreshed - cleared conversation state');
  }, []); // Only run on mount

  const handleSend = async (question: string) => {
    console.log('📤 handleSend called with question:', question);
    console.log('🔐 Auth state:', { SSO_ENABLED, isAuthenticated, userId: user?.uid, userEmail: user?.email });
    
    if (!question.trim()) {
      console.warn('⚠️ Empty question, returning');
      return;
    }
    if (SSO_ENABLED && !isAuthenticated) {
      console.warn('⚠️ SSO enabled but not authenticated, returning');
      return;
    }

    // Add user message immediately to UI
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);
    console.log('✅ User message added to UI');

    // Ensure we have a conversation ID before proceeding
    // Only create a conversation if user is actually sending a message (not on page load)
    let conversationIdToUse = currentConversationId;
    console.log('💬 Current conversation ID:', conversationIdToUse);
    
    // If no conversation exists AND user is sending a message, create one
    // This ensures conversations are only created when user actually interacts
    if (!conversationIdToUse && isAuthenticated && user?.uid && question.trim()) {
      console.log('🆕 No conversation ID, creating new conversation for user:', user.uid);
      try {
        // Create conversation synchronously to get the ID, but with timeout
        const createPromise = createConversation(user.uid);
        const timeoutPromise = new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('Conversation creation timeout')), 3000)
        );
        
        conversationIdToUse = await Promise.race([createPromise, timeoutPromise]);
        console.log('📝 Conversation creation result:', conversationIdToUse);
        
        // Only use if it's not a temporary ID
        if (conversationIdToUse && !conversationIdToUse.startsWith('temp_')) {
          setCurrentConversationId(conversationIdToUse);
          console.log('✅ Conversation created and set:', conversationIdToUse);
        } else {
          console.warn('⚠️ Got temporary conversation ID, will retry later:', conversationIdToUse);
          conversationIdToUse = null;
        }
      } catch (error) {
        console.error('❌ Error creating conversation:', error);
        conversationIdToUse = null;
      }
    } else if (!conversationIdToUse && !question.trim()) {
      console.warn('⚠️ Cannot create conversation - empty question');
    } else if (!conversationIdToUse) {
      console.warn('⚠️ Cannot create conversation:', { 
        hasConversationId: !!conversationIdToUse,
        isAuthenticated,
        hasUserId: !!user?.uid,
        hasQuestion: !!question.trim()
      });
    }

    // Save user message if we have a valid conversation ID
    if (conversationIdToUse && !conversationIdToUse.startsWith('temp_') && isAuthenticated) {
      console.log('💾 Saving user message to conversation:', conversationIdToUse);
      const conversationIdForCleanup = conversationIdToUse; // Store for potential cleanup
      addMessage(conversationIdToUse, {
        role: 'user',
        content: question
      }).then(() => {
        console.log('✅ User message saved successfully');
        
        // Update title if this is the first message
        if (messages.length === 0) {
          const title = question.length > 50 ? question.substring(0, 50) + '...' : question;
          updateConversationTitle(conversationIdToUse, title).catch(err => 
            console.error('Error updating title:', err)
          );
        }
      }).catch(err => {
        console.error('❌ Error saving user message:', err);
        console.error('Error details:', {
          code: err.code,
          message: err.message,
          stack: err.stack
        });
        
        // If message save fails and this is a newly created conversation, delete it to prevent empty conversations
        if (conversationIdForCleanup === conversationIdToUse && messages.length === 0) {
          console.log('🗑️ Deleting empty conversation due to failed message save');
          deleteConversation(conversationIdForCleanup).catch(deleteErr => {
            console.error('Error deleting empty conversation:', deleteErr);
          });
          setCurrentConversationId(null);
        }
      });
    } else {
      console.warn('⚠️ Skipping user message save:', {
        hasConversationId: !!conversationIdToUse,
        isTempId: conversationIdToUse?.startsWith('temp_'),
        isAuthenticated
      });
    }
    
    // Create promise for assistant message saving
    const conversationPromise: Promise<string | null> = Promise.resolve(conversationIdToUse);

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
      
      // Use backend API URL
      const apiUrl = (typeof window !== 'undefined' && (window as any).__NEXT_DATA__?.env?.NEXT_PUBLIC_API_URL) 
        || process.env.NEXT_PUBLIC_API_URL 
        || 'https://product-gpt-chat-api-420423430685.us-east4.run.app';
      const endpoint = `${apiUrl}/api/chat/ask`;
      
      // Create AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 seconds

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question,
          session_id: currentConversationId || `session_${Date.now()}`,
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

      // Save assistant message to Firestore
      // Wait a bit for conversation to be created if needed, then save
      const saveAssistantMessage = async () => {
        let conversationId = conversationIdToUse;
        
        // If no conversation ID yet, wait for it to be created (max 3 seconds)
        if (!conversationId && isAuthenticated && user?.uid) {
          for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            conversationId = currentConversationId;
            if (conversationId && !conversationId.startsWith('temp_')) {
              break;
            }
          }
        }
        
        if (conversationId && !conversationId.startsWith('temp_') && isAuthenticated) {
          console.log('Saving assistant message to conversation:', conversationId);
          addMessage(conversationId, {
            role: 'assistant',
            content: assistantMessage.content,
            sources: assistantMessage.sources
          }).then(() => {
            console.log('✅ Assistant message saved');
            // Trigger sidebar refresh
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new Event('conversationCreated'));
            }
          }).catch(err => {
            console.error('❌ Error saving assistant message:', err);
          });
        } else {
          console.warn('⚠️ Skipping assistant message save - no valid conversation ID');
        }
      };
      
      saveAssistantMessage();
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

  // Show loading state while auth is initializing
  if (SSO_ENABLED && authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Only show login screen if SSO is enabled AND not loading AND not authenticated
  if (SSO_ENABLED && !isAuthenticated && !authLoading) {
    const handleSignIn = async () => {
      try {
        await signIn();
      } catch (error: any) {
        alert(`Sign-in failed: ${error.message || error.code || 'Unknown error'}. Please check the browser console for details.`);
        console.error('Sign-in error details:', error);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Product GPT Chat</h1>
          <p className="text-gray-600 mb-6">Sign in with your PulsePoint account to continue</p>
          <button
            onClick={handleSignIn}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar - only show if authenticated */}
      {isAuthenticated && (
        <ConversationSidebar
          currentConversationId={currentConversationId}
          onSelectConversation={loadConversation}
          onNewConversation={handleNewConversation}
        />
      )}

      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${isAuthenticated ? 'ml-64' : ''}`}>
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
        <main className="flex-1 overflow-y-auto max-w-4xl w-full mx-auto px-4 py-6 pb-20">
          {loadingConversation ? (
            <div className="text-center text-gray-500 mt-12">
              <p>Loading conversation...</p>
            </div>
          ) : (
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
          )}
        </main>

        {/* Chat Input */}
        <footer className="bg-white border-t">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <ChatInput onSend={handleSend} disabled={loading || loadingConversation} />
          </div>
        </footer>
      </div>
    </div>
  );
}

