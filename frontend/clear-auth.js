// This will clear auth on app load for testing
if (typeof window !== 'undefined' && window.localStorage) {
  window.localStorage.removeItem('isAuthenticated');
}
