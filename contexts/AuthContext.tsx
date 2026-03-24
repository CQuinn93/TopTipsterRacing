import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { cancelAllSelectionReminders } from '@/lib/selectionReminderNotifications';
import { getOrCreateTabletCode } from '@/lib/tabletCode';

type AuthContextType = {
  session: Session | null;
  userId: string | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) setIsLoading(false);
    }, 10000);

    const clearTimeoutAndDone = () => {
      clearTimeout(timeoutId);
    };

    supabase.auth.getSession().then(
      ({ data: { session: s } }) => {
        if (!cancelled) {
          setSession(s ?? null);
          setIsLoading(false);
        }
        clearTimeoutAndDone();
      },
      () => {
        if (!cancelled) setIsLoading(false);
        clearTimeoutAndDone();
      }
    );

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    // Ensure quick-access code exists as soon as a user has a session.
    getOrCreateTabletCode(uid).catch(() => {});
  }, [session?.user?.id]);

  const signOut = async () => {
    await cancelAllSelectionReminders();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        userId: session?.user?.id ?? null,
        isLoading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
