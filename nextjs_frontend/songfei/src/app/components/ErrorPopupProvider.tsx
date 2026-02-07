'use client';

import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import ErrorPopup from './ErrorPopup';

export interface ErrorPopupContextValue {
  errorMessage: string | null;
  showErrorPopup: (message: string) => void;
  closeErrorPopup: () => void;
}

export const ErrorPopupContext = createContext<ErrorPopupContextValue | undefined>(undefined);

export default function ErrorPopupProvider({ children }: { children: React.ReactNode }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showErrorPopup = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  const closeErrorPopup = useCallback(() => {
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const message = event?.message || 'Unexpected error occurred.';
      showErrorPopup(message);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason;
      const message =
        (reason && (reason.message || (typeof reason === 'string' ? reason : ''))) ||
        'Unexpected error occurred.';
      showErrorPopup(message);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [showErrorPopup]);

  const value = useMemo(
    () => ({ errorMessage, showErrorPopup, closeErrorPopup }),
    [errorMessage, showErrorPopup, closeErrorPopup]
  );

  return (
    <ErrorPopupContext.Provider value={value}>
      {children}
      <ErrorPopup message={errorMessage} onClose={closeErrorPopup} />
    </ErrorPopupContext.Provider>
  );
}
