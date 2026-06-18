import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBackendBaseUrl } from '../lib/api-base';
import { useTheme } from '../context/ThemeContext';

const EXPO_PUBLIC_BACKEND_URL = getBackendBaseUrl();

interface DyeItem {
  dye_name: string;
  quantity: number;
}

interface Shade {
  id: string;
  shade_number: string;
  original_weight: number;
  program_number: string;
  rc: string;
  dyes: DyeItem[];
}

export default function Index() {
  const router = useRouter();
  const { colors } = useTheme();
  const [shades, setShades] = useState<Shade[]>([]);
  const [filteredShades, setFilteredShades] = useState<Shade[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchShades();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredShades(shades);
    } else {
      const filtered = shades.filter((shade) =>
        shade.shade_number.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredShades(filtered);
    }
  }, [searchQuery, shades]);

  const fetchShades = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/shades`);
      const data = await response.json();
      const sortedData = data.sort((a: Shade, b: Shade) => {
        const numA = parseInt(a.shade_number) || 0;
        const numB = parseInt(b.shade_number) || 0;
        return numA - numB;
      });
      setShades(sortedData);
      setFilteredShades(sortedData);
    } catch (error) {
      console.error('Error fetching shades:', error);
      Alert.alert('Error', 'Failed to load shades');
    } finally {
      setLoading(false);
    }
  };

  const deleteShade = async (id: string) => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/shades/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        if (Platform.OS === 'web') {
          alert('Shade deleted successfully!');
        } else {
          Alert.alert('Success', 'Shade deleted successfully');
        }
        fetchShades();
      } else {
        if (Platform.OS === 'web') {
          alert('Failed to delete shade');
        } else {
          Alert.alert('Error', 'Failed to delete shade');
        }
      }
    } catch (error) {
      console.error('Error deleting shade:', error);
      if (Platform.OS === 'web') {
        alert('Failed to delete shade');
      } else {
        Alert.alert('Error', 'Failed to delete shade');
      }
    }
  };

  const handleDeletePress = (id: string, shadeNumber: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Kya aap sure hain ki Shade #${shadeNumber} delete karna hai?`);
      if (confirmed) {
        deleteShade(id);
      }
    } else {
      Alert.alert(
        'Delete Shade',
        `Are you sure you want to delete Shade ${shadeNumber}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteShade(id) },
        ]
      );
    }
  };

  const handleLogout = () => {
    const performLogout = async () => {
      await AsyncStorage.removeItem('isAuthenticated');
      await AsyncStorage.removeItem('userRole');
      if (Platform.OS === 'web') {
        window.location.href = '/login';
      } else {
        router.replace('/login');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to logout?');
      if (confirmed) {
        performLogout();
      }
      return;
    }

    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: performLogout,
        },
      ]
    );
  };

  const renderShadeItem = ({ item }: { item: Shade }) => (
    <TouchableOpacity
      style={[styles.shadeCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}
      onPress={() => router.push(`/calculator?shadeId=${item.id}`)}
    >
      <View style={styles.shadeHeader}>
        <Text style={[styles.shadeNumber, { color: colors.text }]}>Shade #{item.shade_number}</Text>
        <View style={styles.badgeRow}>
          {item.rc === 'Yes' && (
            <View style={[styles.rcBadge, { backgroundColor: '#805AD5' }]}>
              <Text style={styles.rcText}>RC</Text>
            </View>
          )}
          <View style={[styles.programBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.programText}>{item.program_number || 'P1'}</Text>
          </View>
        </View>
      </View>
      <View style={styles.shadeInfo}>
        <Text style={[styles.shadeWeight, { color: colors.primary }]}>{item.original_weight} kg</Text>
        <Text style={[styles.dyesLabel, { color: colors.textSecondary }]}>{item.dyes.length} dyes</Text>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.editButton, { backgroundColor: colors.secondary }]}
          onPress={() => router.push(`/edit-shade?shadeId=${item.id}`)}
        >
          <Text style={styles.editButtonText}>✎ Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: colors.danger }]}
          onPress={() => handleDeletePress(item.id, item.shade_number)}
        >
          <Text style={styles.deleteButtonText}>🗑 Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, shadowColor: colors.shadow }]}>
        <View style={styles.headerLeft}>
          <Image
            source={require('../assets/images/logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Bajaj Dyeing Unit</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Admin Dashboard</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout} style={[styles.logoutButton, { backgroundColor: colors.danger }]}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
          placeholder="🔍 Search by shade number..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={[styles.quickActions, { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.quickActionButton, { backgroundColor: colors.secondary }]}
          onPress={() => router.push('/daily-tasks')}
        >
          <Text style={styles.quickActionIcon}>📋</Text>
          <Text style={styles.quickActionText}>Daily Tasks</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.quickActionButton, { backgroundColor: colors.accent }]}
          onPress={() => router.push('/dyeing-master')}
        >
          <Text style={styles.quickActionIcon}>👨‍🏭</Text>
          <Text style={styles.quickActionText}>Dyeing Master</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading shades...</Text>
        </View>
      ) : filteredShades.length === 0 ? (
        <View style={styles.centerContent}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {searchQuery ? 'No shades found' : 'No shades added yet'}
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary, opacity: 0.7 }]}>
            {!searchQuery && 'Tap + button to add your first shade'}
          </Text>
        </View>
      ) : (
        <View style={styles.listWrapper}>
          <FlatList
            data={filteredShades}
            renderItem={renderShadeItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={true}
            style={styles.flatList}
          />
        </View>
      )}

      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
        onPress={() => router.push('/add-shade')}
      >
        <Text style={styles.addButtonText}>+ Add Shade</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLogo: {
    width: 42,
    height: 42,
    borderRadius: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  logoutText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 12,
  },
  quickActions: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionIcon: {
    fontSize: 18,
  },
  quickActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  searchInput: {
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    borderWidth: 1.5,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  shadeCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  shadeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  shadeNumber: {
    fontSize: 17,
    fontWeight: 'bold',
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  rcBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  rcText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 11,
  },
  programBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  programText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  listWrapper: {
    flex: 1,
  },
  flatList: {
    flex: 1,
  },
  shadeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  shadeWeight: {
    fontSize: 16,
    fontWeight: '700',
  },
  dyesLabel: {
    fontSize: 13,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  editButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  addButton: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
});
