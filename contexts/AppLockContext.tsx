import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth } from '@/contexts/AuthContext';

type AppLockContextType = {
  isLocked: boolean;
  unlock: () => Promise<boolean>;
};

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (!session) {
      setIsLocked(false);
    }
  }, [session]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;
      if (!session || Platform.OS === 'web') return;
      if (
        (prevState === 'active' && (nextState === 'inactive' || nextState === 'background')) ||
        (prevState === 'inactive' && nextState === 'background')
      ) {
        setIsLocked(true);
      }
    });
    return () => sub.remove();
  }, [session]);

  const unlock = async () => {
    if (Platform.OS === 'web') {
      setIsLocked(false);
      return true;
    }

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) {
      // If biometrics/passcode are not available on the device, don't block access.
      setIsLocked(false);
      return true;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Top Tipster Racing',
      disableDeviceFallback: false,
      cancelLabel: 'Cancel',
    });
    if (result.success) {
      setIsLocked(false);
      return true;
    }
    return false;
  };

  const value = useMemo(
    () => ({
      isLocked: !!session && isLocked,
      unlock,
    }),
    [isLocked, session]
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (ctx === undefined) throw new Error('useAppLock must be used within AppLockProvider');
  return ctx;
}
