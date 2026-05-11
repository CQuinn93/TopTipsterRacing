import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { WcWebMenu } from '@/features/wc2026/components/WcWebMenu';

type WcShellValue = {
  openMenu: () => void;
  closeMenu: () => void;
};

const WcShellContext = createContext<WcShellValue | null>(null);

export function WcShellProvider({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const value = useMemo(() => ({ openMenu, closeMenu }), [openMenu, closeMenu]);

  return (
    <WcShellContext.Provider value={value}>
      {children}
      <WcWebMenu open={menuOpen} onClose={closeMenu} />
    </WcShellContext.Provider>
  );
}

export function useWcShell(): WcShellValue {
  const ctx = useContext(WcShellContext);
  if (!ctx) {
    throw new Error('useWcShell must be used within WcShellProvider');
  }
  return ctx;
}
