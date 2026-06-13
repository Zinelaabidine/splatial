'use client';

import { configureAmplify } from '@/lib/amplifyClient';
import React from 'react';

interface AmplifyProviderProps {
  children: React.ReactNode;
}

export default function AmplifyProvider({ children }: AmplifyProviderProps) {
  configureAmplify();
  return <>{children}</>;
}
