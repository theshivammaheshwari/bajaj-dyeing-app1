import { Platform } from 'react-native';

export function getBackendBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  // On web deployments we proxy API under the same domain at /api.
  if (Platform.OS === 'web') {
    return '';
  }

  // Native fallback for local development.
  return 'http://localhost:8000';
}