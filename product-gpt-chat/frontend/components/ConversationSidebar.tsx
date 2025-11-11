'use client';

import { useState, useEffect } from 'react';
import { useGoogleAuth } from '../lib/auth';
import {
  getConversations,
  createConversation,
  getConversationMessages,
  addMessage,
  updateConversationTitle,
  deleteConversation,
  Conversation,
  ChatMessage
} from '../lib/firestore';

interface ConversationSidebarProps {
  currentConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
}

export default function ConversationSidebar({
  currentConversationId,
  onSelectConversation,
  onNewConversation
}: ConversationSidebarProps) {
  const { user, isAuthenticated } = useGoogleAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && user?.uid) {
      loadConversations();
      
      // Listen for new conversation events
      const handleConversationCreated = () => {
        loadConversations();
      };
      window.addEventListener('conversationCreated', handleConversationCreated);
      
      return () => {
        window.removeEventListener('conversationCreated', handleConversationCreated);
      };
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, user?.uid, currentConversationId]); // Reload when conversation changes

  const loadConversations = async () => {
    if (!user?.uid) return;
    
    try {
      setLoading(true);
      const convos = await getConversations(user.uid);
      setConversations(convos);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this conversation?')) return;

    try {
      setDeletingId(conversationId);
      await deleteConversation(conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      if (currentConversationId === conversationId) {
        onNewConversation();
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      alert('Failed to delete conversation');
    } finally {
      setDeletingId(null);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col h-screen">
      <div className="p-4 border-b border-gray-700">
        <button
          onClick={onNewConversation}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + New Chat
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="text-gray-400 text-sm text-center py-4">Loading...</div>
        ) : conversations.length === 0 ? (
          <div className="text-gray-400 text-sm text-center py-4">
            No conversations yet
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => onSelectConversation(conversation.id)}
                className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-800 ${
                  currentConversationId === conversation.id ? 'bg-gray-800' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {conversation.title}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {conversation.messageCount} messages
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(e, conversation.id)}
                  disabled={deletingId === conversation.id}
                  className="opacity-0 group-hover:opacity-100 ml-2 text-gray-400 hover:text-red-400 transition-opacity"
                  title="Delete conversation"
                >
                  {deletingId === conversation.id ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

