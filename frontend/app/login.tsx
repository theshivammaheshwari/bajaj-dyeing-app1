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
const MASTER_1_PASSWORD = '3020';
const MASTER_2_PASSWORD = '6922';

// Winding Operator Accounts
const OPERATORS: { [key: string]: { user: string; pass: string; name: string; machine: string } } = {
  phool: { user: 'phool', pass: 'phool@123', name: 'Phool', machine: 'M1' },
  rajeev: { user: 'rajeev', pass: 'rajeev@123', name: 'Rajeev', machine: 'M2' },
  operator3: { user: 'operator3', pass: 'op3@123', name: 'Operator 3', machine: 'M3' },
  operator4: { user: 'operator4', pass: 'op4@123', name: 'Operator 4', machine: 'M4' },
  operator5: { user: 'operator5', pass: 'op5@123', name: 'Operator 5', machine: 'M5' },
  operator6: { user: 'operator6', pass: 'op6@123', name: 'Operator 6', machine: 'M6' },
  operator7: { user: 'operator7', pass: 'op7@123', name: 'Operator 7', machine: 'M7' },
  operator8: { user: 'operator8', pass: 'op8@123', name: 'Operator 8', machine: 'M8' },
};

export default function Login() {
  const router = useRouter();
  const { colors } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    const cleanPass = password.trim();
    const cleanUser = username.trim().toLowerCase();

    if (!cleanPass) {
      setError('Please enter password');
      return;
    }

    setLoading(true);

    let role = '';
    let userName = '';
    let assignedMachine = '';
    let redirectPath = '/';

    // 1. Check Admin
    if (cleanPass === ADMIN_PASSWORD && (!cleanUser || cleanUser === 'admin')) {
      role = 'admin';
      userName = 'Admin';
      redirectPath = '/';
    }
    // 2. Check Dyeing Masters
    else if (cleanPass === MASTER_1_PASSWORD && (!cleanUser || cleanUser === 'master1' || cleanUser === 'user1')) {
      role = 'user1';
      userName = 'Dyeing Master 1';
      redirectPath = '/dyeing-master';
    } else if (cleanPass === MASTER_2_PASSWORD && (!cleanUser || cleanUser === 'master2' || cleanUser === 'user2')) {
      role = 'user2';
      userName = 'Dyeing Master 2';
      redirectPath = '/dyeing-master';
    }
    // 3. Check Winding Operators (Phool, Rajeev, Operator 3, Operator 4)
    else {
      // Find operator by matching password OR (username + password)
      let foundOp = null;
      for (const op of Object.values(OPERATORS)) {
        if (cleanPass === op.pass && (!cleanUser || cleanUser === op.user)) {
          foundOp = op;
          break;
        }
      }

      if (foundOp) {
        role = 'winding_operator';
        userName = foundOp.name;
        assignedMachine = foundOp.machine;
        redirectPath = '/winding-master';
      }
    }

    if (role) {
      try {
        await AsyncStorage.setItem('isAuthenticated', 'true');
        await AsyncStorage.setItem('userRole', role);
        await AsyncStorage.setItem('userName', userName);
        if (assignedMachine) {
          await AsyncStorage.setItem('assignedMachine', assignedMachine);
        }

        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.location.href = redirectPath;
          } else {
            router.replace(redirectPath as any);
          }
        }, 100);
      } catch (err) {
        console.error('Error saving auth state:', err);
        setError('Failed to save login state');
        setLoading(false);
      }
    } else {
      setError('Incorrect username or password. Please try again.');
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
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Thread Dyeing & Winding Management</Text>
          </View>

          <View style={[styles.loginCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}>
            <Text style={[styles.title, { color: colors.text }]}>Welcome Back</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Enter username & password or PIN to access your workspace
            </Text>

            {/* Username Input */}
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Username (ऑपरेटर यूजरनेम)</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.border
                  }
                ]}
                placeholder="phool, rajeev (optional for Admin/Master)"
                placeholderTextColor={colors.textSecondary}
                value={username}
                onChangeText={(t) => { setUsername(t); setError(''); }}
                autoCapitalize="none"
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Password (पासवर्ड)</Text>
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
                autoCapitalize="none"
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
            <Text style={[styles.footerText, { color: colors.primary }]}>🔒 Role-Based Access</Text>
            <Text style={[styles.footerSubtext, { color: colors.textSecondary }]}>
              Admin • Dyeing Masters • Winding Operators (M1–M8)
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
