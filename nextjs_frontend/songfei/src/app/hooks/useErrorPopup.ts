'use client';

/**
 * Reusable React hook for the app shell.
 *
 * Hooks in this folder expose shared state or behaviors to client components without duplicating wiring code in every page.
 */

/**
 * Exposes the global error popup context to client components.
 *
 * Components call this hook when they want to show a user-friendly error modal
 * instead of handling every error inline.
 */

import { useContext } from 'react';
import { ErrorPopupContext } from '../components/ErrorPopupProvider';

/** Returns the shared error popup API from the nearest provider. */
export default function useErrorPopup() {
  const context = useContext(ErrorPopupContext);

  if (!context) {
    throw new Error('useErrorPopup must be used within ErrorPopupProvider');
  }

  return context;
}
