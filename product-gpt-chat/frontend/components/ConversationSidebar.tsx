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
  cleanupEmptyConversations,
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user?.uid) {
      // Cleanup empty conversations on mount (only once)
      cleanupEmptyConversations(user.uid).then(deletedCount => {
        if (deletedCount > 0) {
          console.log(`🧹 Cleaned up ${deletedCount} empty conversations`);
        }
        // Load conversations after cleanup
        loadConversations();
      }).catch(err => {
        console.error('Error cleaning up empty conversations:', err);
        // Still load conversations even if cleanup fails
        loadConversations();
      });
      
      // Listen for new conversation events (only reload if we have conversations with messages)
      const handleConversationCreated = () => {
        // Only reload if we have conversations - this prevents unnecessary reloads
        // Reload conversations after a short delay to allow Firestore to update
        setTimeout(() => {
          loadConversations();
        }, 500);
      };
      window.addEventListener('conversationCreated', handleConversationCreated);
      
      return () => {
        window.removeEventListener('conversationCreated', handleConversationCreated);
      };
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, user?.uid]); // Only run when auth state changes, not on conversation change

  const loadConversations = async () => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      console.log('Loading conversations for user:', user.uid);
      // Use shorter timeout for faster UI response
      const convos = await getConversations(user.uid, 3000);
      console.log('Loaded conversations:', convos.length);
      
      // Filter out empty conversations immediately
      const conversationsWithMessages = convos.filter(c => c.messageCount > 0);
      const emptyCount = convos.length - conversationsWithMessages.length;
      
      if (emptyCount > 0) {
        console.warn(`⚠️ Found ${emptyCount} empty conversations, cleaning up...`);
        // Cleanup empty conversations in background
        cleanupEmptyConversations(user.uid).catch(err => {
          console.error('Error cleaning up empty conversations:', err);
        });
      }
      
      setConversations(conversationsWithMessages);
    } catch (error) {
      console.error('Error loading conversations:', error);
      // Don't show error to user - just show empty list
      // Conversations will load when Firestore index is ready
      setConversations([]);
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
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(conversationId);
        return newSet;
      });
      
      // If deleting the current conversation, clear it
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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} conversation(s)?`)) return;

    try {
      setBulkDeleting(true);
      const deletePromises = Array.from(selectedIds).map(id => deleteConversation(id));
      await Promise.all(deletePromises);
      
      setConversations(prev => prev.filter(c => !selectedIds.has(c.id)));
      
      // If current conversation is being deleted, clear it
      if (currentConversationId && selectedIds.has(currentConversationId)) {
        onNewConversation();
      }
      
      setSelectedIds(new Set());
      setIsBulkMode(false);
    } catch (error) {
      console.error('Error bulk deleting conversations:', error);
      alert('Failed to delete some conversations');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    const conversationsWithMessages = conversations.filter(c => c.messageCount > 0);
    if (conversationsWithMessages.length === 0) {
      alert('No conversations to delete');
      return;
    }
    
    if (!confirm(`Are you sure you want to delete ALL ${conversationsWithMessages.length} conversation(s)? This cannot be undone.`)) return;

    try {
      setBulkDeleting(true);
      const deletePromises = conversationsWithMessages.map(c => deleteConversation(c.id));
      await Promise.all(deletePromises);
      
      setConversations([]);
      setSelectedIds(new Set());
      setIsBulkMode(false);
      
      // Clear current conversation
      if (currentConversationId) {
        onNewConversation();
      }
    } catch (error) {
      console.error('Error deleting all conversations:', error);
      alert('Failed to delete some conversations');
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelect = (conversationId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(conversationId)) {
        newSet.delete(conversationId);
      } else {
        newSet.add(conversationId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    const conversationsWithMessages = conversations.filter(c => c.messageCount > 0);
    if (selectedIds.size === conversationsWithMessages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(conversationsWithMessages.map(c => c.id)));
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  const conversationsWithMessages = conversations.filter(c => c.messageCount > 0);

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col h-screen fixed left-0 top-0 bottom-0">
      <div className="p-4 border-b border-gray-700 flex-shrink-0 space-y-2">
        <button
          onClick={onNewConversation}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + New Chat
        </button>
        {conversationsWithMessages.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsBulkMode(!isBulkMode);
                if (isBulkMode) {
                  setSelectedIds(new Set());
                }
              }}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded text-xs"
            >
              {isBulkMode ? 'Cancel' : 'Select'}
            </button>
            {isBulkMode && (
              <>
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0 || bulkDeleting}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-xs"
                >
                  {bulkDeleting ? 'Deleting...' : `Delete (${selectedIds.size})`}
                </button>
                <button
                  onClick={handleDeleteAll}
                  disabled={bulkDeleting}
                  className="flex-1 bg-red-700 hover:bg-red-800 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-xs"
                  title="Delete all conversations"
                >
                  Delete All
                </button>
              </>
            )}
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {loading ? (
          <div className="text-gray-400 text-sm text-center py-4">Loading...</div>
        ) : conversations.length === 0 ? (
          <div className="text-gray-400 text-sm text-center py-4">
            No conversations yet
          </div>
        ) : (
          <div className="space-y-1">
            {isBulkMode && conversationsWithMessages.length > 0 && (
              <div className="p-2 border-b border-gray-700">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === conversationsWithMessages.length}
                    onChange={toggleSelectAll}
                    className="mr-2"
                  />
                  <span className="text-xs text-gray-400">
                    Select All ({selectedIds.size}/{conversationsWithMessages.length})
                  </span>
                </label>
              </div>
            )}
            {conversations
              // Only show conversations that have messages (filter out all empty conversations)
              .filter((conversation) => conversation.messageCount > 0)
              .map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => {
                  if (isBulkMode) {
                    toggleSelect(conversation.id);
                  } else {
                    onSelectConversation(conversation.id);
                  }
                }}
                className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-800 ${
                  currentConversationId === conversation.id ? 'bg-gray-800' : ''
                } ${isBulkMode && selectedIds.has(conversation.id) ? 'bg-blue-900' : ''}`}
              >
                {isBulkMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(conversation.id)}
                    onChange={() => toggleSelect(conversation.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mr-2"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {conversation.title}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {conversation.messageCount} messages
                  </div>
                </div>
                {!isBulkMode && (
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
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

