'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Firebase imports - only if SSO is enabled
let GoogleAuthProvider: any;
let SAMLAuthProvider: any;
let signInWithPopup: any;
let signInWithRedirect: any;
let getRedirectResult: any;
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
    SAMLAuthProvider = firebase.SAMLAuthProvider;
    signInWithPopup = firebase.signInWithPopup;
    signInWithRedirect = firebase.signInWithRedirect;
    getRedirectResult = firebase.getRedirectResult;
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
let samlProvider: any = null;

// SAML Provider ID - set this after configuring SAML in Firebase Console
// Format: 'saml.PROVIDER_ID' (e.g., 'saml.pulsepoint-saml')
const SAML_PROVIDER_ID = process.env.NEXT_PUBLIC_SAML_PROVIDER_ID || null;

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
    
    // Initialize SAML provider if configured (preferred method to bypass Fortinet)
    if (SAML_PROVIDER_ID && SAMLAuthProvider) {
      try {
        samlProvider = new SAMLAuthProvider(SAML_PROVIDER_ID);
        console.log('✅ SAML provider initialized:', SAML_PROVIDER_ID);
      } catch (error) {
        console.warn('⚠️ Failed to initialize SAML provider:', error);
        samlProvider = null;
      }
    }
    
    // Initialize Google provider as fallback
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({
      hd: 'pulsepoint.com',  // Restrict to PulsePoint domain
      prompt: 'select_account'  // Force account selection, helps with redirect flow
    });
    
    // Add additional scopes if needed
    googleProvider.addScope('profile');
    googleProvider.addScope('email');
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
    loadFirebase().then(async () => {
      initFirebase();
      if (auth) {
        // Check for redirect result first (in case user is returning from redirect)
        try {
          const result = await getRedirectResult(auth);
          if (result?.user) {
            const user = result.user;
            // Verify domain restriction
            if (user.email && !user.email.endsWith('@pulsepoint.com')) {
              console.warn('Non-PulsePoint user detected, signing out');
              await firebaseSignOut(auth);
              setUser(null);
              setLoading(false);
              return;
            }
            setUser(user);
            setLoading(false);
          }
        } catch (error: any) {
          console.error('Error handling redirect result:', error);
          // Continue to auth state listener even if redirect check fails
        }
        
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
    
    // Prefer SAML authentication if configured (bypasses Fortinet interception)
    if (samlProvider) {
      try {
        console.log('🔐 Attempting SAML sign-in (bypasses Fortinet)');
        // SAML always uses redirect
        await signInWithRedirect(auth, samlProvider);
        // This will redirect the page, so this line won't execute
        return;
      } catch (error: any) {
        console.error('❌ SAML sign-in failed:', error);
        // Fall through to Google OAuth fallback
      }
    }
    
    // Fallback to Google OAuth if SAML not configured or failed
    if (!googleProvider) {
      throw new Error('No authentication provider configured');
    }
    
    // Try popup first (it was working before), fall back to redirect if blocked
    try {
      console.log('🔐 Attempting Google sign-in with popup');
      
      // Try popup first - this was working before Fortinet interception
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Verify domain restriction
      if (user.email && !user.email.endsWith('@pulsepoint.com')) {
        await firebaseSignOut(auth);
        throw new Error('Only PulsePoint employees (@pulsepoint.com) can access this application.');
      }
      
      console.log('✅ Popup sign-in successful');
      return;
    } catch (error: any) {
      console.warn('⚠️ Popup sign-in failed:', error.code, error.message);
      
      // If popup is blocked or fails, fall back to redirect
      if (
        error.code === 'auth/popup-blocked' ||
        error.code === 'auth/popup-closed-by-user' ||
        error.code === 'auth/cancelled-popup-request' ||
        error.message?.includes('popup')
      ) {
        console.log('🔄 Popup blocked/failed, falling back to redirect');
        try {
          // Fall back to redirect
          await signInWithRedirect(auth, googleProvider);
          // This will redirect the page, so this line won't execute
          return;
        } catch (redirectError: any) {
          console.error('❌ Redirect also failed:', redirectError);
          throw new Error('Both popup and redirect authentication failed. Please check your browser settings or network configuration.');
        }
      }
      
      // For other errors, throw them as-is
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

