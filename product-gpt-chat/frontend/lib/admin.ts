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
import { getApps, initializeApp, getApp } from 'firebase/app';

export interface UserPermission {
  id: string;
  email: string;
  allowedModels: string[];
  isActive: boolean;
  isAdmin?: boolean;  // Admin users can access admin panel
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
  if (typeof window === 'undefined') {
    return null;
  }
  
  if (!db) {
    try {
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
        app = getApp();
      }
      
      db = getFirestore(app);
    } catch (error) {
      console.error('Error initializing Firestore:', error);
      return null;
    }
  }
  return db;
};

// User Permissions Functions
export const getUserPermissions = async (): Promise<UserPermission[]> => {
  const firestoreDb = getDb();
  if (!firestoreDb) {
    console.error('Firestore not initialized');
    throw new Error('Firestore not initialized');
  }

  const q = query(
    collection(firestoreDb, 'user_permissions'),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    email: doc.data().email,
    allowedModels: doc.data().allowedModels || [],
    isActive: doc.data().isActive !== false,
    isAdmin: doc.data().isAdmin === true,
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date(),
  }));
};

export const getUserPermission = async (email: string): Promise<UserPermission | null> => {
  const firestoreDb = getDb();
  if (!firestoreDb) {
    console.error('Firestore not initialized');
    throw new Error('Firestore not initialized');
  }

  const q = query(
    collection(firestoreDb, 'user_permissions'),
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
    isAdmin: docData.isAdmin === true,
    createdAt: docData.createdAt?.toDate() || new Date(),
    updatedAt: docData.updatedAt?.toDate() || new Date(),
  };
};

export const createUserPermission = async (
  email: string, 
  allowedModels: string[] = [],
  isAdmin: boolean = false
): Promise<string> => {
  const firestoreDb = getDb();
  if (!firestoreDb) {
    console.error('Firestore not initialized');
    throw new Error('Firestore not initialized');
  }

  // Check if user already exists
  const existing = await getUserPermission(email);
  if (existing) {
    throw new Error('User already exists');
  }

  const now = Timestamp.now();
  const docRef = await addDoc(collection(firestoreDb, 'user_permissions'), {
    email: email.toLowerCase(),
    allowedModels,
    isActive: true,
    isAdmin: isAdmin,
    createdAt: now,
    updatedAt: now,
  });

  return docRef.id;
};

export const updateUserPermission = async (
  userId: string,
  allowedModels: string[],
  isAdmin?: boolean
): Promise<void> => {
  const firestoreDb = getDb();
  if (!firestoreDb) {
    console.error('Firestore not initialized');
    throw new Error('Firestore not initialized');
  }

  const updateData: any = {
    allowedModels,
    updatedAt: Timestamp.now(),
  };
  
  if (isAdmin !== undefined) {
    updateData.isAdmin = isAdmin;
  }

  await updateDoc(doc(firestoreDb, 'user_permissions', userId), updateData);
};

export const checkIsAdmin = async (email: string): Promise<boolean> => {
  const permission = await getUserPermission(email);
  return permission !== null && permission.isAdmin === true;
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
  const firestoreDb = getDb();
  if (!firestoreDb) {
    console.error('Firestore not initialized');
    throw new Error('Firestore not initialized');
  }

  await addDoc(collection(firestoreDb, 'usage_tracking'), {
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
  const firestoreDb = getDb();
  if (!firestoreDb) {
    console.error('Firestore not initialized');
    throw new Error('Firestore not initialized');
  }

  let q = query(
    collection(firestoreDb, 'usage_tracking'),
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
      collection(firestoreDb, 'usage_tracking'),
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

