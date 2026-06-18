import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getBackendBaseUrl } from '../lib/api-base';
import { useTheme } from '../context/ThemeContext';

const EXPO_PUBLIC_BACKEND_URL = getBackendBaseUrl();

interface DyeInput {
  id: string;
  dye_name: string;
  quantity: string;
}

interface Shade {
  id: string;
  shade_number: string;
  original_weight: number;
  program_number: string;
  rc: string;
  dyes: Array<{
    dye_name: string;
    quantity: number;
  }>;
}

export default function EditShade() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const shadeId = params.shadeId as string;
  const { colors } = useTheme();

  const [shadeNumber, setShadeNumber] = useState('');
  const [originalWeight, setOriginalWeight] = useState('');
  const [programNumber, setProgramNumber] = useState('P1');
  const [rcValue, setRcValue] = useState('No');
  const [dyes, setDyes] = useState<DyeInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allDyeNames, setAllDyeNames] = useState<string[]>([]);
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);

  useEffect(() => {
    fetchDyeNames();
  }, []);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const fetchDyeNames = async () => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/dye-names`);
      const data = await response.json();
      setAllDyeNames(data.dye_names || []);
    } catch (error) {
      console.error('Error fetching dye names:', error);
    }
  };

  const handleDyeNameChange = (id: string, value: string) => {
    updateDye(id, 'dye_name', value);
    
    if (value.trim().length > 0) {
      const filtered = allDyeNames.filter(name =>
        name.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered);
      setActiveSuggestionId(id);
    } else {
      setFilteredSuggestions([]);
      setActiveSuggestionId(null);
    }
  };

  const selectSuggestion = (id: string, suggestion: string) => {
    updateDye(id, 'dye_name', suggestion);
    setFilteredSuggestions([]);
    setActiveSuggestionId(null);
  };

  useEffect(() => {
    if (shadeId) {
      fetchShade();
    }
  }, [shadeId]);

  const fetchShade = async () => {
    try {
      const response = await fetch(
        `${EXPO_PUBLIC_BACKEND_URL}/api/shades/${shadeId}`
      );
      const data: Shade = await response.json();

      setShadeNumber(data.shade_number);
      setOriginalWeight(data.original_weight.toString());
      setProgramNumber(data.program_number || 'P1');
      setRcValue(data.rc || 'No');
      setDyes(
        data.dyes.map((dye, index) => ({
          id: index.toString(),
          dye_name: dye.dye_name,
          quantity: dye.quantity.toString(),
        }))
      );
    } catch (error) {
      console.error('Error fetching shade:', error);
      Alert.alert('Error', 'Failed to load shade');
    } finally {
      setLoading(false);
    }
  };

  const addDyeField = () => {
    setDyes([...dyes, { id: Date.now().toString(), dye_name: '', quantity: '' }]);
  };

  const removeDyeField = (id: string) => {
    if (dyes.length > 1) {
      setDyes(dyes.filter((dye) => dye.id !== id));
    }
  };

  const updateDye = (id: string, field: 'dye_name' | 'quantity', value: string) => {
    setDyes(
      dyes.map((dye) => (dye.id === id ? { ...dye, [field]: value } : dye))
    );
  };

  const validateForm = () => {
    if (!shadeNumber.trim()) {
      Alert.alert('Error', 'Please enter shade number');
      return false;
    }

    const weight = parseFloat(originalWeight);
    if (!originalWeight || isNaN(weight) || weight <= 0) {
      Alert.alert('Error', 'Please enter valid original weight');
      return false;
    }

    const validDyes = dyes.filter(
      (dye) => dye.dye_name.trim() && dye.quantity.trim()
    );

    if (validDyes.length === 0) {
      Alert.alert('Error', 'Please add at least one dye with name and quantity');
      return false;
    }

    for (const dye of validDyes) {
      const qty = parseFloat(dye.quantity);
      if (isNaN(qty) || qty <= 0) {
        Alert.alert('Error', `Invalid quantity for dye: ${dye.dye_name}`);
        return false;
      }
    }

    return true;
  };

  const handleUpdate = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const validDyes = dyes
        .filter((dye) => dye.dye_name.trim() && dye.quantity.trim())
        .map((dye) => ({
          dye_name: dye.dye_name.trim(),
          quantity: parseFloat(dye.quantity),
        }));

      const payload = {
        shade_number: shadeNumber.trim(),
        original_weight: parseFloat(originalWeight),
        program_number: programNumber,
        rc: rcValue,
        dyes: validDyes,
      };

      const response = await fetch(
        `${EXPO_PUBLIC_BACKEND_URL}/api/shades/${shadeId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        Alert.alert('Success', 'Shade updated successfully', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        const error = await response.json();
        Alert.alert('Error', error.detail || 'Failed to update shade');
      }
    } catch (error) {
      console.error('Error updating shade:', error);
      Alert.alert('Error', 'Failed to update shade');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    // For web, use confirm; for mobile use Alert
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Kya aap sure hain ki Shade #${shadeNumber} delete karna hai?`);
      if (confirmed) {
        try {
          const response = await fetch(
            `${EXPO_PUBLIC_BACKEND_URL}/api/shades/${shadeId}`,
            { method: 'DELETE' }
          );
          if (response.ok) {
            alert('Shade deleted successfully!');
            router.back();
          } else {
            alert('Failed to delete shade');
          }
        } catch (error) {
          console.error('Error deleting shade:', error);
          alert('Failed to delete shade');
        }
      }
    } else {
      Alert.alert(
        'Delete Shade',
        `Kya aap sure hain ki Shade #${shadeNumber} delete karna hai?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                const response = await fetch(
                  `${EXPO_PUBLIC_BACKEND_URL}/api/shades/${shadeId}`,
                  { method: 'DELETE' }
                );
                if (response.ok) {
                  Alert.alert('Success', 'Shade deleted successfully', [
                    { text: 'OK', onPress: () => router.back() },
                  ]);
                } else {
                  Alert.alert('Error', 'Failed to delete shade');
                }
              } catch (error) {
                console.error('Error deleting shade:', error);
                Alert.alert('Error', 'Failed to delete shade');
              }
            },
          },
        ]
      );
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />
        <View style={styles.centerContent}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Shade</Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
        >
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Shade Information</Text>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Shade Number *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                placeholder="e.g., 7"
                placeholderTextColor={colors.textSecondary}
                value={shadeNumber}
                onChangeText={setShadeNumber}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Original Weight (kg) *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                placeholder="e.g., 6"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                value={originalWeight}
                onChangeText={setOriginalWeight}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Machine Program *</Text>
              <View style={styles.programButtons}>
                {['P1', 'P2', 'P3'].map((program) => (
                  <TouchableOpacity
                    key={program}
                    style={[
                      styles.programButton,
                      { backgroundColor: colors.inputBackground, borderColor: colors.border },
                      programNumber === program && [styles.programButtonActive, { backgroundColor: '#FF9800', borderColor: '#FF9800' }],
                    ]}
                    onPress={() => setProgramNumber(program)}
                  >
                    <Text
                      style={[
                        styles.programButtonText,
                        { color: colors.textSecondary },
                        programNumber === program && [styles.programButtonTextActive, { color: '#fff' }],
                      ]}
                    >
                      {program}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>RC (Reduction Clearing) *</Text>
              <View style={styles.programButtons}>
                {['Yes', 'No'].map((rc) => (
                  <TouchableOpacity
                    key={rc}
                    style={[
                      styles.rcButton,
                      { backgroundColor: colors.inputBackground, borderColor: colors.border },
                      rcValue === rc && [styles.rcButtonActive, { backgroundColor: '#9C27B0', borderColor: '#9C27B0' }],
                    ]}
                    onPress={() => setRcValue(rc)}
                  >
                    <Text
                      style={[
                        styles.programButtonText,
                        { color: colors.textSecondary },
                        rcValue === rc && [styles.programButtonTextActive, { color: '#fff' }],
                      ]}
                    >
                      {rc}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Dye Colors</Text>
              <TouchableOpacity onPress={addDyeField} style={[styles.addDyeButton, { backgroundColor: colors.secondary }]}>
                <Text style={styles.addDyeButtonText}>+ Add Dye</Text>
              </TouchableOpacity>
            </View>

            {dyes.map((dye, index) => (
              <View key={dye.id} style={[styles.dyeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.dyeHeader}>
                  <Text style={[styles.dyeNumber, { color: colors.primary }]}>Dye {index + 1}</Text>
                  {dyes.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeDyeField(dye.id)}
                      style={[styles.removeButton, { backgroundColor: colors.danger }]}
                    >
                      <Text style={styles.removeButtonText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Dye Name *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                    placeholder="e.g., Yellow Brown"
                    placeholderTextColor={colors.textSecondary}
                    value={dye.dye_name}
                    onChangeText={(value) => handleDyeNameChange(dye.id, value)}
                    onFocus={() => {
                      if (dye.dye_name.trim().length > 0) {
                        const filtered = allDyeNames.filter(name =>
                          name.toLowerCase().includes(dye.dye_name.toLowerCase())
                        );
                        setFilteredSuggestions(filtered);
                        setActiveSuggestionId(dye.id);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        if (activeSuggestionId === dye.id) {
                          setActiveSuggestionId(null);
                        }
                      }, 200);
                    }}
                  />
                  {activeSuggestionId === dye.id && filteredSuggestions.length > 0 && (
                    <View style={[styles.suggestionsContainer, { backgroundColor: colors.card, borderColor: colors.primary }]}>
                      <ScrollView 
                        style={styles.suggestionsList} 
                        nestedScrollEnabled={true}
                        keyboardShouldPersistTaps="handled"
                      >
                        {filteredSuggestions.slice(0, 5).map((suggestion, idx) => (
                          <TouchableOpacity
                            key={idx}
                            style={[styles.suggestionItem, { borderBottomColor: colors.border }]}
                            onPress={() => selectSuggestion(dye.id, suggestion)}
                          >
                            <Text style={[styles.suggestionText, { color: colors.text }]}>{suggestion}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Quantity (grams) *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                    placeholder="e.g., 41.93"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="decimal-pad"
                    value={dye.quantity}
                    onChangeText={(value) => updateDye(dye.id, 'quantity', value)}
                  />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.headerBackground, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: colors.danger }]}
            onPress={handleDelete}
          >
            <Text style={styles.deleteButtonText}>🗑️ Delete Shade</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primary }, saving && styles.saveButtonDisabled]}
            onPress={handleUpdate}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Updating...' : 'Update Shade'}
            </Text>
          </TouchableOpacity>
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
  header: {
    padding: 16,
    paddingTop: 8,
  },
  backButton: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
  },
  suggestionsContainer: {
    position: 'relative',
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    maxHeight: 150,
    overflow: 'hidden',
  },
  suggestionsList: {
    maxHeight: 150,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
  },
  suggestionText: {
    fontSize: 15,
  },
  dyeCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  dyeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dyeNumber: {
    fontSize: 16,
    fontWeight: '600',
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  addDyeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addDyeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  programButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  programButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
  },
  programButtonActive: {
  },
  programButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  programButtonTextActive: {
  },
  rcButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
  },
  rcButtonActive: {
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    borderTopWidth: 1,
    gap: 10,
  },
  deleteButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
});
