'use client';

/**
 * Shared application UI component.
 *
 * This file contains reusable presentation logic that is consumed by multiple storefront or ERP routes.
 */

/**
 * Owns the application's global error popup state and browser-level listeners.
 *
 * This is the central place where unexpected errors are turned into a reusable
 * modal, which keeps error UX consistent across pages and components.
 */

import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import ErrorPopup from './ErrorPopup';

/** The values exposed to any component that wants to open or close the error popup. */
export interface ErrorPopupContextValue {
  errorMessage: string | null;
  showErrorPopup: (message: string) => void;
  closeErrorPopup: () => void;
}

export const ErrorPopupContext = createContext<ErrorPopupContextValue | undefined>(undefined);

/** Provides error popup state to the app and listens for uncaught browser errors. */
export default function ErrorPopupProvider({ children }: { children: React.ReactNode }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /** Opens the popup with a new error message. */
  const showErrorPopup = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  /** Clears the current error and hides the popup. */
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
