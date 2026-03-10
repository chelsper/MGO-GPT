'use client';

import { useEffect } from 'react';

export function useDevServerHeartbeat() {
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const ping = () => {
      // Keeps the dev proxy alive while the user is active.
      fetch('/', { method: 'GET' }).catch(() => {
        // no-op
      });
    };

    let lastPing = 0;
    const onAction = () => {
      const now = Date.now();
      if (now - lastPing >= 60_000 * 3) {
        lastPing = now;
        ping();
      }
    };

    window.addEventListener('pointerdown', onAction);
    window.addEventListener('keydown', onAction);
    window.addEventListener('scroll', onAction, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', onAction);
      window.removeEventListener('keydown', onAction);
      window.removeEventListener('scroll', onAction);
    };
  }, []);
}
