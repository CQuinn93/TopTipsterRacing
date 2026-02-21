import React, { createContext, useContext, useState, useCallback } from 'react';

type ForceRefreshContextType = {
  /** Increments when Home cache should be cleared and data refetched. */
  homeTrigger: number;
  /** Call to clear Home caches and trigger a refetch (e.g. after 10s tab hold). */
  triggerHomeForceRefresh: () => void;
};

const ForceRefreshContext = createContext<ForceRefreshContextType | undefined>(undefined);

export function ForceRefreshProvider({ children }: { children: React.ReactNode }) {
  const [homeTrigger, setHomeTrigger] = useState(0);
  const triggerHomeForceRefresh = useCallback(() => {
    setHomeTrigger((t) => t + 1);
  }, []);

  return (
    <ForceRefreshContext.Provider value={{ homeTrigger, triggerHomeForceRefresh }}>
      {children}
    </ForceRefreshContext.Provider>
  );
}

export function useForceRefresh() {
  const ctx = useContext(ForceRefreshContext);
  if (ctx === undefined) {
    throw new Error('useForceRefresh must be used within ForceRefreshProvider');
  }
  return ctx;
}
