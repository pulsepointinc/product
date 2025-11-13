'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Firebase imports - only if SSO is enabled
let GoogleAuthProvider: any;
let signInWithPopup: any;
let firebaseSignOut: any;
let onAuthStateChanged: any;
let initializeApp: any;
let getApps: any;
let getAuth: any;

// Lazy load Firebase only if needed
const loadFirebase = async () => {
  if (typeof window !== 'undefined') {
    const firebase = await import('firebase/auth');
    const firebaseApp = await import('firebase/app');
    GoogleAuthProvider = firebase.GoogleAuthProvider;
    signInWithPopup = firebase.signInWithPopup;
    firebaseSignOut = firebase.signOut;
    onAuthStateChanged = firebase.onAuthStateChanged;
    initializeApp = firebaseApp.initializeApp;
    getApps = firebaseApp.getApps;
    getAuth = firebaseApp.getAuth;
  }
};

// Firebase will be initialized only if SSO is enabled
let app: any = null;
let auth: any = null;
let googleProvider: any = null;

const initFirebase = () => {
  if (typeof window === 'undefined') return;
  
  // Use provided Firebase config or fall back to environment variables
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyB5g8EI16p2waqesbR0JvBymbNBhg5t6Rs",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "pulsepoint-bitstrapped-ai.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "pulsepoint-bitstrapped-ai",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "pulsepoint-bitstrapped-ai.firebasestorage.app",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "505719121244",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:505719121244:web:85409d7987746786740d99"
  };

  if (firebaseConfig.apiKey && firebaseConfig.authDomain) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({
      hd: 'pulsepoint.com'  // Restrict to PulsePoint domain
    });
  }
};

interface AuthContextType {
  user: any;
  isAuthenticated: boolean;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const SSO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SSO === 'true';

  useEffect(() => {
    if (!SSO_ENABLED) {
      setLoading(false);
      return;
    }

    // Load Firebase if SSO is enabled
    loadFirebase().then(() => {
      initFirebase();
      if (auth) {
        const unsubscribe = onAuthStateChanged(auth, (user: any) => {
          // Verify domain restriction on auth state change
          if (user && user.email && !user.email.endsWith('@pulsepoint.com')) {
            console.warn('Non-PulsePoint user detected, signing out');
            firebaseSignOut(auth);
            setUser(null);
            setLoading(false);
            return;
          }
          setUser(user);
          setLoading(false);
        });
        return () => unsubscribe();
      } else {
        setLoading(false);
      }
    });
  }, [SSO_ENABLED]);

  const signIn = async () => {
    if (!SSO_ENABLED || !auth) {
      console.warn('SSO is not enabled');
      return;
    }
    
    if (!googleProvider) {
      throw new Error('Google provider not initialized');
    }
    
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Verify domain restriction
      if (user.email && !user.email.endsWith('@pulsepoint.com')) {
        await firebaseSignOut(auth);
        throw new Error('Only PulsePoint employees (@pulsepoint.com) can access this application.');
      }
    } catch (error: any) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    if (!SSO_ENABLED || !auth) {
      return;
    }
    try {
      await firebaseSignOut(auth);
    } catch (error: any) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        signIn,
        signOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useGoogleAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useGoogleAuth must be used within an AuthProvider');
  }
  return context;
}
