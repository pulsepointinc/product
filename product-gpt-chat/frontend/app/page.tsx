'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
import { checkUserAccess } from '../lib/admin';

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
  const [creatingConversation, setCreatingConversation] = useState(false); // Prevent duplicate creation
  const [modelPreference, setModelPreference] = useState<string>('auto'); // 'auto', 'gpt-4o-mini', 'gpt-4o', 'gemini-2.0-flash-001'
  const { user, isAuthenticated, signIn, signOut, loading: authLoading } = useGoogleAuth();
  const SSO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SSO === 'true';
  const [hasAccess, setHasAccess] = useState<boolean | null>(null); // null = checking, true = has access, false = no access
  const [checkingAccess, setCheckingAccess] = useState(false);
  // Email/password login state (must be at top level - React hooks rule)
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

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

    // Clear messages and conversation ID immediately
    // Don't save messages here - they should already be saved when created in handleSend
    // Saving them again would create duplicates
    setMessages([]);
    setCurrentConversationId(null);
    
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
    
    // Prevent multiple simultaneous loads
    if (loadingConversation) {
      console.log('Already loading a conversation, skipping');
      return;
    }
    
    setLoadingConversation(true);
    try {
      // Clear existing messages first to prevent duplication
      setMessages([]);
      setCurrentConversationId(null); // Clear ID first to prevent race conditions
      
      const firestoreMessages = await getConversationMessages(conversationId);
      console.log(`📥 Loaded ${firestoreMessages.length} messages from Firestore for conversation: ${conversationId}`);
      
      const formattedMessages: Message[] = firestoreMessages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        sources: msg.sources,
        timestamp: msg.timestamp.toISOString()
      }));
      
      // Use functional update to ensure we're setting fresh messages (not appending)
      setMessages(() => formattedMessages);
      setCurrentConversationId(conversationId);
      console.log(`✅ Set ${formattedMessages.length} messages in UI`);
    } catch (error) {
      console.error('Error loading conversation:', error);
      alert('Failed to load conversation');
      // Ensure messages are cleared even on error
      setMessages([]);
      setCurrentConversationId(null);
    } finally {
      setLoadingConversation(false);
    }
  }, [currentConversationId, messages.length, loadingConversation]);

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

  // Check user access when authenticated
  useEffect(() => {
    const verifyAccess = async () => {
      if (!SSO_ENABLED) {
        // If SSO is disabled, allow access
        setHasAccess(true);
        return;
      }

      if (!isAuthenticated || !user?.email) {
        setHasAccess(false);
        return;
      }

      // Always allow bweinstein@pulsepoint.com (fallback admin)
      if (user.email === 'bweinstein@pulsepoint.com' || user.email?.toLowerCase() === 'bweinstein@pulsepoint.com') {
        setHasAccess(true);
        return;
      }

      setCheckingAccess(true);
      try {
        // Add timeout to prevent hanging forever
        const timeoutPromise = new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Access check timeout')), 5000)
        );
        const accessPromise = checkUserAccess(user.email);
        const access = await Promise.race([accessPromise, timeoutPromise]);
        console.log(`🔐 Access check for ${user.email}: ${access ? 'GRANTED' : 'DENIED'}`);
        setHasAccess(access);
      } catch (error) {
        console.error('Error checking user access:', error);
        // On timeout or error, allow access temporarily (will be checked again on next request)
        // This prevents the app from being stuck on "Loading..."
        console.warn('⚠️ Access check failed/timed out, allowing access temporarily');
        setHasAccess(true);
      } finally {
        setCheckingAccess(false);
      }
    };

    verifyAccess();
  }, [isAuthenticated, user?.email, SSO_ENABLED]);

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
    // Also prevent duplicate creation if one is already in progress
    if (!conversationIdToUse && isAuthenticated && user?.uid && question.trim() && !creatingConversation) {
      console.log('🆕 No conversation ID, creating new conversation for user:', user.uid);
      setCreatingConversation(true);
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
      } finally {
        setCreatingConversation(false);
      }
    } else if (!conversationIdToUse && !question.trim()) {
      console.warn('⚠️ Cannot create conversation - empty question');
    } else if (!conversationIdToUse && creatingConversation) {
      console.warn('⚠️ Conversation creation already in progress, skipping');
    } else if (!conversationIdToUse) {
      console.warn('⚠️ Cannot create conversation:', { 
        hasConversationId: !!conversationIdToUse,
        isAuthenticated,
        hasUserId: !!user?.uid,
        hasQuestion: !!question.trim(),
        creatingConversation
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
          max_results: 50,
          model_preference: modelPreference !== 'auto' ? modelPreference : undefined
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

  // Show loading screen while checking auth or access
  if (authLoading || checkingAccess || hasAccess === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  // Only show login screen if SSO is enabled AND not loading AND not authenticated
  if (SSO_ENABLED && !isAuthenticated && !authLoading) {
    const handleGoogleSignIn = async () => {
      console.log('🔘 Google sign in button clicked');
      setLoginError('');
      try {
        await signIn();
      } catch (error: any) {
        console.error('🔘 Sign-in error caught in handleGoogleSignIn:', error);
        const errorMsg = error.message || error.code || 'Unknown error';
        setLoginError(`Google sign-in failed: ${errorMsg}. Try email/password login instead.`);
      }
    };

    const handleEmailSignIn = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginError('');
      if (!email || !password) {
        setLoginError('Please enter both email and password');
        return;
      }
      
      if (!email.endsWith('@pulsepoint.com')) {
        setLoginError('Only @pulsepoint.com email addresses are allowed');
        return;
      }

      try {
        console.log('🔘 Email sign in attempted');
        await signIn(email, password);
      } catch (error: any) {
        console.error('🔘 Email sign-in error:', error);
        const errorMsg = error.message || error.code || 'Unknown error';
        if (error.code === 'auth/user-not-found') {
          setLoginError('User not found. Please contact an administrator to create your account.');
        } else if (error.code === 'auth/wrong-password') {
          setLoginError('Incorrect password. Please try again.');
        } else if (error.code === 'auth/invalid-email') {
          setLoginError('Invalid email address.');
        } else {
          setLoginError(`Sign-in failed: ${errorMsg}`);
        }
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md w-full px-4">
          <h1 className="text-3xl font-bold mb-4">Product GPT Chat</h1>
          <p className="text-gray-600 mb-6">Sign in with your PulsePoint account to continue</p>
          
          {!showEmailLogin ? (
            <>
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 mb-2">
                  <strong>Note:</strong> Google SSO may be blocked by Fortinet. If you see a Fortinet login page, use email/password instead.
                </p>
              </div>
              <button
                onClick={() => setShowEmailLogin(true)}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 mb-3 w-full"
              >
                Sign in with Email/Password (Recommended)
              </button>
              <button
                onClick={handleGoogleSignIn}
                className="bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 w-full text-sm"
              >
                Try Google SSO (may be blocked)
              </button>
              {loginError && (
                <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                  {loginError}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleEmailSignIn} className="text-left">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email (@pulsepoint.com)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="yourname@pulsepoint.com"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your password"
                  required
                />
              </div>
              {loginError && (
                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                  {loginError}
                </div>
              )}
              <button
                type="submit"
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 mb-2"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEmailLogin(false);
                  setEmail('');
                  setPassword('');
                  setLoginError('');
                }}
                className="w-full text-gray-600 text-sm underline"
              >
                Back to sign-in options
              </button>
              <p className="mt-4 text-xs text-gray-500">
                Note: Users must be created in Firebase Console first. Contact an administrator if you don't have an account.
              </p>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Check if user has access (only if SSO is enabled and authenticated)
  if (SSO_ENABLED && isAuthenticated && hasAccess === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-2">
            You don't have permission to access this platform.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Please contact an administrator to request access.
          </p>
          <button
            onClick={signOut}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const isAdmin = user?.email === 'bweinstein@pulsepoint.com';

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
        {/* Header matching Genome Studio style */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-full mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-6">
              <div className="flex items-center justify-center w-12 h-12 rounded-full" style={{ backgroundColor: '#6B46C1' }}>
                <span className="text-white text-xs font-bold">PP GPT</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Admin Link */}
              {isAdmin && (
                <Link
                  href="/admin"
                  className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded hover:bg-gray-100"
                >
                  Admin
                </Link>
              )}
              {/* Model Selector */}
              <div className="flex items-center gap-2">
                <label htmlFor="model-select" className="text-sm text-gray-600">Model:</label>
                <select
                  id="model-select"
                  value={modelPreference}
                  onChange={(e) => setModelPreference(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={loading}
                >
                  <option value="auto">Auto (Recommended)</option>
                  <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cost-Effective)</option>
                  <option value="gpt-4o">GPT-4o (High Quality)</option>
                  <option value="gemini-2.0-flash-001">Gemini 2.0 Flash (Balanced)</option>
                </select>
              </div>
              {SSO_ENABLED && user && (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <span className="text-sm text-gray-700">{user.email?.split('@')[0]}</span>
                </div>
              )}
              {SSO_ENABLED && (
                <button
                  onClick={signOut}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Sign out
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Chat Messages */}
        <main className="flex-1 overflow-y-auto max-w-4xl w-full mx-auto px-6 py-6 pb-20 bg-gray-50">
          {loadingConversation ? (
            <div className="text-center text-gray-500 mt-12">
              <p>Loading conversation...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-gray-600 mt-12">
                  <p className="text-xl font-semibold mb-2">Welcome to PP GPT</p>
                  <p className="text-sm">Ask me anything about PulsePoint products, roadmaps, or documentation.</p>
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
        <footer className="bg-white border-t border-gray-200">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <ChatInput onSend={handleSend} disabled={loading || loadingConversation} />
          </div>
        </footer>
      </div>
    </div>
  );
}

