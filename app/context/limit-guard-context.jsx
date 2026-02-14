'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import LimitReachedModal from '@/app/components/ui/LimitReachedModal';
import { useUser } from '@/app/context/user-context';

/**
 * Global event name for limit / credit errors.
 *
 * Any code can trigger:
 *   window.dispatchEvent(new CustomEvent('ghostpost:limit-error', {
 *     detail: { code, resourceKey, usage, required }
 *   }));
 *
 * The LimitGuardProvider listens for this event and shows the appropriate modal.
 */
export const LIMIT_ERROR_EVENT = 'ghostpost:limit-error';

/**
 * Convenience helper – call from anywhere (even outside React) to trigger the
 * limit-reached / insufficient-credits popup.
 *
 * @param {{ code: string, resourceKey: string, usage?: object, required?: number }} detail
 */
export function emitLimitError(detail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LIMIT_ERROR_EVENT, { detail }));
  }
}

/**
 * Inspect an API JSON response and, if it carries a limit/credit error code,
 * emit the global event. Returns `true` if an error was detected.
 *
 * Usage:
 *   const data = await res.json();
 *   if (handleLimitError(data)) return; // modal is already showing
 */
export function handleLimitError(data) {
  if (
    data &&
    (data.code === 'LIMIT_REACHED' || data.code === 'INSUFFICIENT_CREDITS')
  ) {
    emitLimitError(data);
    return true;
  }
  return false;
}

// ── React context ────────────────────────────────────────────────

const LimitGuardContext = createContext(undefined);

export function LimitGuardProvider({ children }) {
  const { user } = useUser();
  const [limitModal, setLimitModal] = useState(null); // { resourceKey, usage }

  // Listen for global limit-error events
  useEffect(() => {
    const handler = (e) => {
      const { resourceKey, usage } = e.detail || {};
      if (resourceKey) {
        setLimitModal({ resourceKey, usage: usage || null });
      }
    };

    window.addEventListener(LIMIT_ERROR_EVENT, handler);
    return () => window.removeEventListener(LIMIT_ERROR_EVENT, handler);
  }, []);

  const closeModal = useCallback(() => {
    setLimitModal(null);
  }, []);

  // Provide the emitter as context so components can call it without importing
  const triggerLimitError = useCallback((detail) => {
    emitLimitError(detail);
  }, []);

  return (
    <LimitGuardContext.Provider value={{ triggerLimitError }}>
      {children}

      {/* Global LimitReachedModal – rendered once in the tree */}
      {limitModal && (
        <LimitReachedModal
          isOpen={true}
          onClose={closeModal}
          resourceKey={limitModal.resourceKey}
          accountId={user?.accountId || null}
          usage={limitModal.usage}
        />
      )}
    </LimitGuardContext.Provider>
  );
}

export function useLimitGuard() {
  const context = useContext(LimitGuardContext);
  if (context === undefined) {
    throw new Error('useLimitGuard must be used within a LimitGuardProvider');
  }
  return context;
}
