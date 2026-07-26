import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type SportMenuVariant = 'racing' | 'lms';

type SidebarContextValue = {
  open: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  variant: SportMenuVariant;
  setVariant: (v: SportMenuVariant) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({
  children,
  initialVariant = 'racing',
}: {
  children: ReactNode;
  initialVariant?: SportMenuVariant;
}) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<SportMenuVariant>(initialVariant);
  const openSidebar = useCallback(() => setOpen(true), []);
  const closeSidebar = useCallback(() => setOpen(false), []);
  const toggleSidebar = useCallback(() => setOpen((v) => !v), []);

  return (
    <SidebarContext.Provider
      value={{ open, openSidebar, closeSidebar, toggleSidebar, variant, setVariant }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}
