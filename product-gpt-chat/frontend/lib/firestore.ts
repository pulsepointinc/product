'use client';

import { getFirestore, collection, query, where, orderBy, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getApps, initializeApp, getApp } from 'firebase/app';

// Initialize Firestore (reuse Firebase app if already initialized)
let db: any = null;

const initFirestore = () => {
  if (typeof window === 'undefined') {
    console.warn('⚠️ initFirestore: window is undefined (server-side)');
    return null;
  }
  
  try {
    console.log('🔧 Initializing Firestore...');
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
    console.log('📱 Existing Firebase apps:', apps.length);
    
    // Use the default app (should be the same one Auth uses)
    let app;
    if (apps.length === 0) {
      app = initializeApp(firebaseConfig);
      console.log('🆕 Created new Firebase app');
    } else {
      app = apps[0]; // Use first app (should be the default)
      console.log('♻️ Reusing existing Firebase app:', app.name);
    }
    
    // Verify auth is available
    try {
      const auth = getAuth(app);
      const currentUser = auth.currentUser;
      console.log('👤 Current Firebase Auth user:', currentUser ? currentUser.uid : 'null');
    } catch (authError) {
      console.warn('⚠️ Could not get auth instance:', authError);
    }
    
    db = getFirestore(app);
    console.log('✅ Firestore initialized successfully');
    return db;
  } catch (error) {
    console.error('❌ Error initializing Firestore:', error);
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

export const createConversation = async (userId: string, title?: string, timeoutMs: number = 10000): Promise<string> => {
  console.log('📝 createConversation called for userId:', userId);
  
  if (!db) {
    console.log('🔧 Firestore DB not initialized, initializing now...');
    db = initFirestore();
  }
  
  if (!db) {
    // Return a temporary ID if Firestore is not available
    console.warn('⚠️ Firestore not initialized - using temporary conversation ID');
    return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Verify auth is available and wait for it if needed
  try {
    const { getAuth } = await import('firebase/auth');
    const { getApps } = await import('firebase/app');
    const apps = getApps();
    if (apps.length > 0) {
      const auth = getAuth(apps[0]);
      let currentUser = auth.currentUser;
      
      // If no current user, wait a bit for auth state to initialize (max 2 seconds)
      if (!currentUser) {
        console.log('⏳ Waiting for auth state to initialize...');
        for (let i = 0; i < 20; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          currentUser = auth.currentUser;
          if (currentUser) break;
        }
      }
      
      console.log('🔐 Auth check - Current user:', currentUser ? `${currentUser.uid} (${currentUser.email})` : 'null');
      if (!currentUser) {
        console.error('🚫 No authenticated user - Firestore operations WILL FAIL due to security rules!');
        console.error('💡 Make sure you are signed in and Firebase Auth is working');
      } else {
        console.log('✅ User is authenticated, Firestore operations should work');
      }
    }
  } catch (authError) {
    console.warn('⚠️ Could not verify auth:', authError);
  }

  console.log('✅ Firestore DB is ready, creating conversation...');

  try {
    // Add timeout to prevent hanging (increased to 10 seconds)
    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error('Firestore create timeout')), timeoutMs);
    });

    const createPromise = (async () => {
      const conversationData = {
        userId,
        title: title || 'New Conversation',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        messageCount: 0
      };

      console.log('💾 Adding conversation document:', conversationData);
      console.log('⏱️ Starting addDoc operation...');
      
      const startTime = Date.now();
      const docRef = await addDoc(collection(db, 'conversations'), conversationData);
      const duration = Date.now() - startTime;
      
      console.log(`✅ Conversation document created with ID: ${docRef.id} (took ${duration}ms)`);
      return docRef.id;
    })();

    const result = await Promise.race([createPromise, timeoutPromise]);
    console.log('✅ createConversation completed, returning ID:', result);
    return result;
  } catch (error: any) {
    console.error('❌ Error creating conversation:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Check for permission errors specifically
    if (error.code === 'permission-denied') {
      console.error('🚫 PERMISSION DENIED - Check Firestore security rules!');
      console.error('💡 Make sure security rules allow authenticated users to create conversations');
    }
    
    // Return temporary ID so chat can continue working
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.warn('⚠️ Returning temporary conversation ID:', tempId);
    return tempId;
  }
};

export const getConversations = async (userId: string, timeoutMs: number = 5000): Promise<Conversation[]> => {
  if (!db) db = initFirestore();
  if (!db) {
    console.warn('Firestore not initialized - returning empty conversations list');
    return [];
  }

  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<Conversation[]>((_, reject) => {
      setTimeout(() => reject(new Error('Firestore query timeout')), timeoutMs);
    });

    const queryPromise = (async () => {
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
    })();

    return await Promise.race([queryPromise, timeoutPromise]);
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    
    // Check if it's a missing index error
    if (error.code === 'failed-precondition' && error.message?.includes('index')) {
      console.error('Firestore index missing! Please create a composite index for conversations collection with fields: userId (Ascending), updatedAt (Descending)');
      console.error('You can create it manually in Firebase Console or click the link in the error message.');
      // Show alert to user
      if (typeof window !== 'undefined') {
        console.warn('💡 TIP: Click the link in the console error to create the Firestore index automatically');
      }
    } else if (error.message?.includes('timeout')) {
      console.warn('Firestore query timed out - conversations will load when index is ready');
    }
    
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
  if (!db) {
    console.error('Firestore not initialized - cannot save message');
    throw new Error('Firestore not initialized');
  }

  // Don't save to temporary conversation IDs
  if (conversationId.startsWith('temp_')) {
    console.warn('Skipping save to temporary conversation ID:', conversationId);
    return;
  }

  try {
    console.log('Saving message to conversation:', conversationId, 'Role:', message.role);
    await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
      ...message,
      timestamp: Timestamp.now()
    });
    console.log('✅ Message saved successfully');

    // Update conversation's updatedAt and messageCount
    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationDoc = await getDoc(conversationRef);
    if (conversationDoc.exists()) {
      const currentCount = conversationDoc.data().messageCount || 0;
      await updateDoc(conversationRef, {
        updatedAt: Timestamp.now(),
        messageCount: currentCount + 1
      });
      console.log('✅ Conversation updated successfully');
    } else {
      console.warn('⚠️ Conversation document does not exist:', conversationId);
      // If conversation doesn't exist but we're trying to save a message, delete the orphaned message
      console.warn('⚠️ This should not happen - conversation was deleted or never created');
    }
  } catch (error: any) {
    console.error('❌ Error adding message:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      conversationId,
      messageRole: message.role
    });
    
    // If message save fails and conversation has no messages, delete the empty conversation
    if (error.code === 'permission-denied' || error.code === 'not-found') {
      try {
        const conversationRef = doc(db, 'conversations', conversationId);
        const conversationDoc = await getDoc(conversationRef);
        if (conversationDoc.exists()) {
          const data = conversationDoc.data();
          if (data.messageCount === 0) {
            console.log('🗑️ Deleting empty conversation due to failed message save');
            await deleteDoc(conversationRef);
          }
        }
      } catch (deleteError) {
        console.error('Error deleting empty conversation:', deleteError);
      }
    }
    
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

  // Don't delete temporary conversation IDs
  if (conversationId.startsWith('temp_')) {
    console.warn('Skipping delete for temporary conversation ID:', conversationId);
    return;
  }

  try {
    console.log('🗑️ Deleting conversation:', conversationId);
    
    // Delete all messages in the conversation
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const messagesSnapshot = await getDocs(messagesRef);
    const deletePromises = messagesSnapshot.docs.map(docRef => deleteDoc(docRef.ref));
    await Promise.all(deletePromises);
    console.log(`✅ Deleted ${messagesSnapshot.docs.length} messages`);

    // Delete the conversation document
    await deleteDoc(doc(db, 'conversations', conversationId));
    console.log('✅ Conversation deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting conversation:', error);
    throw error;
  }
};

// Cleanup function to delete all empty conversations for a user
export const cleanupEmptyConversations = async (userId: string): Promise<number> => {
  if (!db) db = initFirestore();
  if (!db) {
    console.warn('Firestore not initialized - cannot cleanup empty conversations');
    return 0;
  }

  try {
    console.log('🧹 Cleaning up empty conversations for user:', userId);
    
    // Get all conversations for the user
    const q = query(
      collection(db, 'conversations'),
      where('userId', '==', userId),
      where('messageCount', '==', 0)
    );
    
    const snapshot = await getDocs(q);
    const emptyConversations = snapshot.docs;
    
    if (emptyConversations.length === 0) {
      console.log('✅ No empty conversations to clean up');
      return 0;
    }
    
    console.log(`🗑️ Found ${emptyConversations.length} empty conversations to delete`);
    
    // Delete all empty conversations
    const deletePromises = emptyConversations.map(async (docSnapshot) => {
      const conversationId = docSnapshot.id;
      try {
        // Delete all messages (should be none, but just in case)
        const messagesRef = collection(db, 'conversations', conversationId, 'messages');
        const messagesSnapshot = await getDocs(messagesRef);
        const messageDeletePromises = messagesSnapshot.docs.map(msgDoc => deleteDoc(msgDoc.ref));
        await Promise.all(messageDeletePromises);
        
        // Delete the conversation document
        await deleteDoc(doc(db, 'conversations', conversationId));
        console.log(`✅ Deleted empty conversation: ${conversationId}`);
        return true;
      } catch (error) {
        console.error(`❌ Error deleting empty conversation ${conversationId}:`, error);
        return false;
      }
    });
    
    const results = await Promise.all(deletePromises);
    const deletedCount = results.filter(r => r === true).length;
    
    console.log(`✅ Cleanup complete: Deleted ${deletedCount} empty conversations`);
    return deletedCount;
  } catch (error) {
    console.error('❌ Error cleaning up empty conversations:', error);
    return 0;
  }
};

