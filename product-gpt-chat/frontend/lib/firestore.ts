'use client';

import { getFirestore, collection, query, where, orderBy, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getApps, initializeApp } from 'firebase/app';

// Initialize Firestore (reuse Firebase app if already initialized)
let db: any = null;

const initFirestore = () => {
  if (typeof window === 'undefined') return null;
  
  try {
    // Get existing Firebase app or initialize
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyB5g8EI16p2waqesbR0JvBymbNBhg5t6Rs",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "pulsepoint-bitstrapped-ai.firebaseapp.com",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "pulsepoint-bitstrapped-ai",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "pulsepoint-bitstrapped-ai.firebasestorage.app",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "505719121244",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:505719121244:web:85409d7987746786740d99"
    };

    const apps = getApps();
    const app = apps.length === 0 ? initializeApp(firebaseConfig) : apps[0];
    db = getFirestore(app);
    return db;
  } catch (error) {
    console.error('Error initializing Firestore:', error);
    return null;
  }
};

export interface Conversation {
  id: string;
  title: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp: Date;
}

export const createConversation = async (userId: string, title?: string): Promise<string> => {
  if (!db) db = initFirestore();
  if (!db) throw new Error('Firestore not initialized');

  const conversationData = {
    userId,
    title: title || 'New Conversation',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    messageCount: 0
  };

  const docRef = await addDoc(collection(db, 'conversations'), conversationData);
  return docRef.id;
};

export const getConversations = async (userId: string): Promise<Conversation[]> => {
  if (!db) db = initFirestore();
  if (!db) return [];

  try {
    const q = query(
      collection(db, 'conversations'),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date()
    })) as Conversation[];
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }
};

export const getConversationMessages = async (conversationId: string): Promise<ChatMessage[]> => {
  if (!db) db = initFirestore();
  if (!db) return [];

  try {
    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('timestamp', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate() || new Date()
    })) as ChatMessage[];
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
};

export const addMessage = async (
  conversationId: string,
  message: Omit<ChatMessage, 'id' | 'timestamp'>
): Promise<void> => {
  if (!db) db = initFirestore();
  if (!db) throw new Error('Firestore not initialized');

  try {
    await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
      ...message,
      timestamp: Timestamp.now()
    });

    // Update conversation's updatedAt and messageCount
    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationDoc = await getDoc(conversationRef);
    if (conversationDoc.exists()) {
      const currentCount = conversationDoc.data().messageCount || 0;
      await updateDoc(conversationRef, {
        updatedAt: Timestamp.now(),
        messageCount: currentCount + 1
      });
    }
  } catch (error) {
    console.error('Error adding message:', error);
    throw error;
  }
};

export const updateConversationTitle = async (
  conversationId: string,
  title: string
): Promise<void> => {
  if (!db) db = initFirestore();
  if (!db) throw new Error('Firestore not initialized');

  try {
    await updateDoc(doc(db, 'conversations', conversationId), {
      title,
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error updating conversation title:', error);
    throw error;
  }
};

export const deleteConversation = async (conversationId: string): Promise<void> => {
  if (!db) db = initFirestore();
  if (!db) throw new Error('Firestore not initialized');

  try {
    // Delete all messages in the conversation
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const messagesSnapshot = await getDocs(messagesRef);
    const deletePromises = messagesSnapshot.docs.map(docRef => deleteDoc(docRef.ref));
    await Promise.all(deletePromises);

    // Delete the conversation document
    await deleteDoc(doc(db, 'conversations', conversationId));
  } catch (error) {
    console.error('Error deleting conversation:', error);
    throw error;
  }
};

