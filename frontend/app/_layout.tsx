import { useEffect, useState } from 'react';
import { useRouter, Slot, usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

function RootLayoutContent() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    // Keep auth state in sync after login/logout route transitions.
    checkAuth();
  }, [pathname]);

  const checkAuth = async () => {
    try {
      const auth = await AsyncStorage.getItem('isAuthenticated');
      const role = await AsyncStorage.getItem('userRole');
      console.log('Auth status:', auth, 'Role:', role);
      setIsAuthenticated(auth === 'true');
      setUserRole(role);
    } catch (error) {
      console.error('Error checking auth:', error);
      setIsAuthenticated(false);
      setUserRole(null);
    }
  };

  useEffect(() => {
    if (isAuthenticated === null) return;

    const inLoginScreen = pathname === '/login';

    console.log('Auth:', isAuthenticated, 'Role:', userRole, 'Path:', pathname);

    if (!isAuthenticated && !inLoginScreen) {
      // Not authenticated, redirect to login
      console.log('Redirecting to login');
      router.replace('/login');
    } else if (isAuthenticated) {
      if (inLoginScreen) {
        // Authenticated but on login screen, redirect based on role
        console.log('Already logged in, redirecting');
        router.replace(userRole === 'admin' ? '/' : '/dyeing-master');
      } else {
        // Role-based access control
        const isAdminRoute = ['/', '/daily-tasks', '/add-daily-task', '/edit-daily-task', '/add-shade', '/edit-shade'].includes(pathname);
        const isUserRoute = ['/dyeing-master', '/calculator'].includes(pathname);

        if (userRole === 'user' && isAdminRoute) {
          console.log('User attempting to access Admin route, redirecting to dyeing-master');
          router.replace('/dyeing-master');
        } else if (userRole === 'admin' && pathname === '/dyeing-master') {
          // Admin can see dyeing-master if they want, but home is /
          // router.replace('/'); // Usually admin should be allowed anywhere
        }
      }
    }
  }, [isAuthenticated, userRole, pathname]);

  if (isAuthenticated === null) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
