import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getGuidedTourCompleted, setGuidedTourCompleted } from '@/lib/onboardingStorage';
import { GuidedTourModal } from '@/components/GuidedTourModal';

type OnboardingContextValue = {
  startGuidedTour: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [showTour, setShowTour] = useState(false);
  const [checked, setChecked] = useState(false);

  const startGuidedTour = useCallback(() => {
    setShowTour(true);
  }, []);

  useEffect(() => {
    if (!userId || checked) return;
    let cancelled = false;
    getGuidedTourCompleted(userId).then((completed) => {
      if (!cancelled && !completed) {
        setShowTour(true);
      }
      if (!cancelled) setChecked(true);
    });
    return () => { cancelled = true; };
  }, [userId, checked]);

  const handleComplete = useCallback(() => {
    if (userId) {
      setGuidedTourCompleted(userId).catch(() => {});
    }
    setShowTour(false);
  }, [userId]);

  const handleSkip = useCallback(() => {
    if (userId) {
      setGuidedTourCompleted(userId).catch(() => {});
    }
    setShowTour(false);
  }, [userId]);

  return (
    <OnboardingContext.Provider value={{ startGuidedTour }}>
      {children}
      <GuidedTourModal
        visible={showTour}
        onComplete={handleComplete}
        onSkip={handleSkip}
      />
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
