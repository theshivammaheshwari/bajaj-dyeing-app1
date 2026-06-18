import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';

const ADMIN_PASSWORD = '1987';
const USER_PASSWORD = '3020';

export default function Login() {
  const router = useRouter();
  const { colors } = useTheme();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    if (!password.trim()) {
      setError('Please enter password');
      return;
    }

    setLoading(true);

    let role = '';
    if (password === ADMIN_PASSWORD) {
      role = 'admin';
    } else if (password === USER_PASSWORD) {
      role = 'user';
    }

    if (role) {
      try {
        await AsyncStorage.setItem('isAuthenticated', 'true');
        await AsyncStorage.setItem('userRole', role);

        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.location.href = role === 'admin' ? '/' : '/dyeing-master';
          } else {
            router.replace(role === 'admin' ? '/' : '/dyeing-master');
          }
        }, 100);
      } catch (err) {
        console.error('Error saving auth state:', err);
        setError('Failed to save login state');
        setLoading(false);
      }
    } else {
      setError('Incorrect password. Please try again.');
      setPassword('');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/images/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={[styles.appName, { color: colors.text }]}>Bajaj Dyeing Unit</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Thread Dyeing Recipe Calculator</Text>
          </View>

          <View style={[styles.loginCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}>
            <Text style={[styles.title, { color: colors.text }]}>Welcome Back</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Enter your password to access the dashboard
            </Text>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.inputBackground,
                    borderColor: error ? colors.danger : colors.border
                  }
                ]}
                placeholder="Enter password"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                value={password}
                onChangeText={(t) => { setPassword(t); setError(''); }}
                keyboardType="number-pad"
                maxLength={10}
                autoFocus
                onSubmitEditing={handleLogin}
              />
              {error ? (
                <Text style={[styles.errorText, { color: colors.danger }]}>⚠ {error}</Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.loginButton, { backgroundColor: colors.primary }, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              <Text style={styles.loginButtonText}>
                {loading ? 'Verifying...' : 'Login →'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.primary }]}>🔒 Secure Access</Text>
            <Text style={[styles.footerSubtext, { color: colors.textSecondary }]}>
              Your data is protected with password authentication
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    maxWidth: 440,
    alignSelf: 'center',
    width: '100%',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  loginCard: {
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    marginBottom: 28,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    borderWidth: 1.5,
    letterSpacing: 4,
  },
  errorText: {
    fontSize: 13,
    marginTop: 8,
    fontWeight: '500',
  },
  loginButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  footer: {
    marginTop: 40,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 12,
    textAlign: 'center',
  },
});
