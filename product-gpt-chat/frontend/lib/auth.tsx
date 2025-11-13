'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Firebase imports - only if SSO is enabled
let GoogleAuthProvider: any;
let signInWithPopup: any;
let signInWithRedirect: any;
let getRedirectResult: any;
let signInWithEmailAndPassword: any;
let createUserWithEmailAndPassword: any;
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
    signInWithRedirect = firebase.signInWithRedirect;
    getRedirectResult = firebase.getRedirectResult;
    signInWithEmailAndPassword = firebase.signInWithEmailAndPassword;
    createUserWithEmailAndPassword = firebase.createUserWithEmailAndPassword;
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
  signIn: (email?: string, password?: string) => Promise<void>;
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
    loadFirebase().then(async () => {
      initFirebase();
      if (auth) {
        // Check for redirect result first (in case user is returning from redirect)
        try {
          console.log('🔍 Checking for redirect result...');
          const result = await getRedirectResult(auth);
          console.log('🔍 Redirect result:', result ? 'Found' : 'None');
          
          if (result?.user) {
            const user = result.user;
            console.log('✅ Redirect authentication successful:', user.email);
            
            // Verify domain restriction
            if (user.email && !user.email.endsWith('@pulsepoint.com')) {
              console.warn('⚠️ Non-PulsePoint user detected, signing out');
              await firebaseSignOut(auth);
              setUser(null);
              setLoading(false);
              return;
            }
            setUser(user);
            setLoading(false);
            return; // Don't set up auth state listener if we already have a user from redirect
          } else if (result?.error) {
            console.error('❌ Redirect authentication error:', result.error);
            // Continue to auth state listener to check current auth state
          }
        } catch (error: any) {
          console.error('❌ Error handling redirect result:', error);
          console.error('Error details:', error.code, error.message);
          // Continue to auth state listener even if redirect check fails
        }
        
        // Set up auth state listener for normal authentication flow
        console.log('👂 Setting up auth state listener...');
        const unsubscribe = onAuthStateChanged(auth, (user: any) => {
          console.log('👂 Auth state changed:', user ? `User: ${user.email}` : 'No user');
          
          // Verify domain restriction on auth state change
          if (user && user.email && !user.email.endsWith('@pulsepoint.com')) {
            console.warn('⚠️ Non-PulsePoint user detected, signing out');
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
        console.warn('⚠️ Auth not initialized');
        setLoading(false);
      }
    });
  }, [SSO_ENABLED]);

  const signIn = async (email?: string, password?: string) => {
    console.log('🔐 signIn called', { email: email ? 'provided' : 'not provided' });
    console.log('🔐 SSO_ENABLED:', SSO_ENABLED);
    console.log('🔐 auth:', auth);
    
    if (!SSO_ENABLED) {
      console.warn('❌ SSO is not enabled');
      return;
    }
    
    if (!auth) {
      console.error('❌ Auth not initialized');
      throw new Error('Authentication not initialized. Please refresh the page.');
    }
    
    // If email/password provided, use email/password auth (bypasses Fortinet)
    if (email && password) {
      try {
        console.log('🔐 Attempting email/password sign-in (bypasses Fortinet)...');
        const result = await signInWithEmailAndPassword(auth, email, password);
        const user = result.user;
        console.log('✅ Email/password sign-in successful:', user.email);
        
        // Verify domain restriction
        if (user.email && !user.email.endsWith('@pulsepoint.com')) {
          console.warn('⚠️ Non-PulsePoint user detected, signing out');
          await firebaseSignOut(auth);
          throw new Error('Only PulsePoint employees (@pulsepoint.com) can access this application.');
        }
        
        console.log('✅ Sign-in complete');
        return;
      } catch (error: any) {
        console.error('❌ Email/password sign-in error:', error);
        throw error;
      }
    }
    
    // Otherwise, try Google OAuth
    // NOTE: Due to Fortinet interception, we use redirect by default instead of popup
    // Popup often gets intercepted and goes directly to Firebase handler, skipping Google account chooser
    if (!googleProvider) {
      console.error('❌ Google provider not initialized');
      throw new Error('Google provider not initialized. Please refresh the page.');
    }
    
    // Use redirect by default (works better with Fortinet)
    // Redirect goes through Google's account chooser properly
    console.log('🔄 Using redirect authentication (works better with Fortinet)...');
    try {
      await signInWithRedirect(auth, googleProvider);
      // This will redirect the page, so this line won't execute
      console.log('🔄 Redirect initiated (page will redirect to Google account chooser)');
      return;
    } catch (redirectError: any) {
      console.error('❌ Redirect failed:', redirectError);
      console.error('Redirect error details:', redirectError.code, redirectError.message);
      
      // If redirect fails, try popup as fallback
      console.log('🔄 Redirect failed, trying popup as fallback...');
      try {
        const result = await signInWithPopup(auth, googleProvider);
        console.log('✅ Popup sign-in successful, result:', result);
        const user = result.user;
        console.log('👤 User:', user.email);
        
        // Double-check domain restriction
        if (user.email && !user.email.endsWith('@pulsepoint.com')) {
          console.warn('⚠️ Non-PulsePoint user detected, signing out');
          await firebaseSignOut(auth);
          throw new Error('Only PulsePoint employees (@pulsepoint.com) can access this application.');
        }
        
        console.log('✅ Sign-in complete');
        return;
      } catch (popupError: any) {
        console.error('❌ Popup also failed:', popupError);
        throw new Error(`Authentication failed. Redirect error: ${redirectError.message || redirectError.code || 'Unknown'}. Popup error: ${popupError.message || popupError.code || 'Unknown'}. Please try email/password login.`);
      }
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

