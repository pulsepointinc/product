import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  Timestamp
} from 'firebase/firestore';
import { getApps } from 'firebase/app';
// Re-export initFirestore from firestore.ts
const initFirestore = () => {
  if (typeof window === 'undefined') {
    console.warn('⚠️ initFirestore: window is undefined (server-side)');
    return null;
  }
  
  try {
    const { getFirestore } = require('firebase/firestore');
    const { getApps, initializeApp } = require('firebase/app');
    
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyB5g8EI16p2waqesbR0JvBymbNBhg5t6Rs",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "pulsepoint-bitstrapped-ai.firebaseapp.com",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "pulsepoint-bitstrapped-ai",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "pulsepoint-bitstrapped-ai.firebasestorage.app",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "505719121244",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:505719121244:web:85409d7987746786740d99"
    };

    const apps = getApps();
    let app;
    if (apps.length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = apps[0];
    }
    
    return getFirestore(app);
  } catch (error) {
    console.error('Error initializing Firestore:', error);
    return null;
  }
};

export interface UserPermission {
  id: string;
  email: string;
  allowedModels: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageStats {
  totalCost: number;
  totalRequests: number;
  costByModel: {
    [model: string]: {
      cost: number;
      requests: number;
      inputTokens: number;
      outputTokens: number;
    };
  };
}

export interface UsageRecord {
  userId: string;
  email: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: Date;
  conversationId?: string;
}

let db: any = null;

const getDb = () => {
  if (!db) {
    db = initFirestore();
  }
  return db;
};

// User Permissions Functions
export const getUserPermissions = async (): Promise<UserPermission[]> => {
  const db = getDb();
  if (!db) throw new Error('Firestore not initialized');

  const q = query(
    collection(db, 'user_permissions'),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    email: doc.data().email,
    allowedModels: doc.data().allowedModels || [],
    isActive: doc.data().isActive !== false,
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date(),
  }));
};

export const getUserPermission = async (email: string): Promise<UserPermission | null> => {
  const db = getDb();
  if (!db) throw new Error('Firestore not initialized');

  const q = query(
    collection(db, 'user_permissions'),
    where('email', '==', email.toLowerCase())
  );
  
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  
  const docData = snapshot.docs[0].data();
  return {
    id: snapshot.docs[0].id,
    email: docData.email,
    allowedModels: docData.allowedModels || [],
    isActive: docData.isActive !== false,
    createdAt: docData.createdAt?.toDate() || new Date(),
    updatedAt: docData.updatedAt?.toDate() || new Date(),
  };
};

export const createUserPermission = async (
  email: string, 
  allowedModels: string[] = []
): Promise<string> => {
  const db = getDb();
  if (!db) throw new Error('Firestore not initialized');

  // Check if user already exists
  const existing = await getUserPermission(email);
  if (existing) {
    throw new Error('User already exists');
  }

  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, 'user_permissions'), {
    email: email.toLowerCase(),
    allowedModels,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  return docRef.id;
};

export const updateUserPermission = async (
  userId: string,
  allowedModels: string[]
): Promise<void> => {
  const db = getDb();
  if (!db) throw new Error('Firestore not initialized');

  await updateDoc(doc(db, 'user_permissions', userId), {
    allowedModels,
    updatedAt: Timestamp.now(),
  });
};

export const checkUserAccess = async (email: string): Promise<boolean> => {
  const permission = await getUserPermission(email);
  return permission !== null && permission.isActive;
};

export const checkModelAccess = async (email: string, model: string): Promise<boolean> => {
  const permission = await getUserPermission(email);
  if (!permission || !permission.isActive) return false;
  
  // 'auto' is always allowed if user has access
  if (model === 'auto') return true;
  
  return permission.allowedModels.includes(model);
};

// Usage Tracking Functions
export const recordUsage = async (usage: Omit<UsageRecord, 'timestamp'>): Promise<void> => {
  const db = getDb();
  if (!db) throw new Error('Firestore not initialized');

  await addDoc(collection(db, 'usage_tracking'), {
    userId: usage.userId,
    email: usage.email.toLowerCase(),
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cost: usage.cost,
    conversationId: usage.conversationId || null,
    timestamp: Timestamp.now(),
  });
};

export const getUsageStats = async (startDate?: Date, endDate?: Date): Promise<UsageStats> => {
  const db = getDb();
  if (!db) throw new Error('Firestore not initialized');

  let q = query(
    collection(db, 'usage_tracking'),
    orderBy('timestamp', 'desc')
  );

  if (startDate || endDate) {
    const constraints = [];
    if (startDate) {
      constraints.push(where('timestamp', '>=', Timestamp.fromDate(startDate)));
    }
    if (endDate) {
      constraints.push(where('timestamp', '<=', Timestamp.fromDate(endDate)));
    }
    q = query(
      collection(db, 'usage_tracking'),
      ...constraints,
      orderBy('timestamp', 'desc')
    );
  }

  const snapshot = await getDocs(q);
  
  let totalCost = 0;
  let totalRequests = 0;
  const costByModel: { [key: string]: { cost: number; requests: number; inputTokens: number; outputTokens: number } } = {};

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const model = data.model || 'unknown';
    const cost = data.cost || 0;
    const inputTokens = data.inputTokens || 0;
    const outputTokens = data.outputTokens || 0;

    totalCost += cost;
    totalRequests += 1;

    if (!costByModel[model]) {
      costByModel[model] = {
        cost: 0,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    costByModel[model].cost += cost;
    costByModel[model].requests += 1;
    costByModel[model].inputTokens += inputTokens;
    costByModel[model].outputTokens += outputTokens;
  });

  return {
    totalCost,
    totalRequests,
    costByModel,
  };
};

