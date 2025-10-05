import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { AuthContextType, User } from '../types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          username: session.user.user_metadata?.username,
        });
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.debug('Auth state change:', event, session);
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            username: session.user.user_metadata?.username,
          });
          // Redirect to home page on successful login
          if (event === 'SIGNED_IN' && window.location.pathname !== '/') {
            window.location.href = '/';
          }
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, username: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        },
      },
    });
    if (error) {
      console.error('Signup error:', error);
      throw new Error(error.message || 'Signup failed');
    }
    return data;
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      console.error('Login error:', error);
      throw new Error(error.message || 'Login failed');
    }
    return data;
  };

  const signOut = async () => {
    try {
      // 1) Call Supabase signOut
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Signout error:', error);
        throw new Error(error.message || 'Signout failed');
      }

      // 2) Clear local/session storage related to auth
      try {
        // Clear Supabase auth tokens
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });
        
        const sessionKeys = Object.keys(sessionStorage);
        sessionKeys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            sessionStorage.removeItem(key);
          }
        });
      } catch (e) {
        console.debug('Storage cleanup failed:', e);
      }

      // 3) Optional: revoke Google token if stored
      try {
        const token = localStorage.getItem('google_oauth_access_token') || 
                     sessionStorage.getItem('google_oauth_access_token');
        if (token) {
          fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`, { 
            method: 'POST', 
            mode: 'no-cors' 
          }).catch(() => {});
        }
      } catch (e) {
        console.debug('Google token revoke failed:', e);
      }

      // 4) Redirect to home page
      window.location.href = '/';
      
    } catch (error) {
      console.error('Sign out failed:', error);
      // Show error message
      const errorMsg = document.createElement('div');
      errorMsg.textContent = 'Sign out failed — please try again.';
      errorMsg.setAttribute('role', 'alert');
      errorMsg.className = 'fixed top-4 right-4 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg z-50';
      document.body.appendChild(errorMsg);
      setTimeout(() => errorMsg.remove(), 5000);
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: {
          prompt: 'select_account'
        }
      },
    });
    if (error) {
      console.error('Google OAuth error:', error);
      throw new Error(error.message || 'Google sign-in failed');
    }
    return data;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signUp,
        signIn,
        signOut,
        signInWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}