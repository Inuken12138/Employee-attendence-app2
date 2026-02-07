'use client';

import { useContext } from 'react';
import { ErrorPopupContext } from '../components/ErrorPopupProvider';

export default function useErrorPopup() {
  const context = useContext(ErrorPopupContext);

  if (!context) {
    throw new Error('useErrorPopup must be used within ErrorPopupProvider');
  }

  return context;
}
