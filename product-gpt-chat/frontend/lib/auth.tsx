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
    getAuth = firebase.getAuth;
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
    console.log('🔧 Initializing Firebase...');
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    console.log('🔧 Auth initialized:', auth);
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({
      hd: 'pulsepoint.com'  // Restrict to PulsePoint domain
    });
    console.log('🔧 Google provider initialized:', googleProvider);
  } else {
    console.warn('⚠️ Firebase config missing:', { apiKey: !!firebaseConfig.apiKey, authDomain: !!firebaseConfig.authDomain });
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
    console.log('🔐 signIn called');
    console.log('🔐 SSO_ENABLED:', SSO_ENABLED);
    console.log('🔐 auth:', auth);
    console.log('🔐 googleProvider:', googleProvider);
    
    if (!SSO_ENABLED) {
      console.warn('❌ SSO is not enabled');
      return;
    }
    
    if (!auth) {
      console.error('❌ Auth not initialized');
      throw new Error('Authentication not initialized. Please refresh the page.');
    }
    
    if (!googleProvider) {
      console.error('❌ Google provider not initialized');
      throw new Error('Google provider not initialized. Please refresh the page.');
    }
    
    try {
      console.log('🔐 Calling signInWithPopup...');
      const result = await signInWithPopup(auth, googleProvider);
      console.log('✅ Popup sign-in successful, result:', result);
      const user = result.user;
      console.log('👤 User:', user.email);
      
      // Double-check domain restriction (Firebase hd parameter should handle this, but verify)
      if (user.email && !user.email.endsWith('@pulsepoint.com')) {
        console.warn('⚠️ Non-PulsePoint user detected, signing out');
        await firebaseSignOut(auth);
        throw new Error('Only PulsePoint employees (@pulsepoint.com) can access this application.');
      }
      
      console.log('✅ Sign-in complete');
    } catch (error: any) {
      console.error('❌ Sign in error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
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

