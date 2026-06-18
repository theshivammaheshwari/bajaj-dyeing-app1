import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  Modal,
  Platform,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBackendBaseUrl } from '../lib/api-base';
import { useTheme } from '../context/ThemeContext';

const EXPO_PUBLIC_BACKEND_URL = getBackendBaseUrl();
const MACHINE_WEIGHTS = [6, 10.5, 12, 24];

const MACHINE_MAPPING: { [key: number]: string } = {
  6: "M4",
  10.5: "M1",
  12: "M2 / M3",
  24: "M5"
};

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

interface ScaledDye {
  dye_name: string;
  quantity: number;
}

interface CartItem {
  id: string;
  shadeNumber: string;
  programNumber: string;
  weight: number;
  rc: string;
  machine: string;
  originalWeight: number;
  twoP?: string;
  threeP?: string;
  dyes: ScaledDye[];
}

export default function Calculator() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const shadeId = params.shadeId as string;
  const { colors } = useTheme();

  const [shade, setShade] = useState<Shade | null>(null);
  const [selectedMachine, setSelectedMachine] = useState<number | 'random'>(6);
  const [randomWeight, setRandomWeight] = useState<string>('');
  const [twoPValues, setTwoPValues] = useState<{ [key: string]: string }>({ '6': '', '10.5': '', '12': '', '24': '', 'random': '' });
  const [threePValues, setThreePValues] = useState<{ [key: string]: string }>({ '6': '', '10.5': '', '12': '', '24': '', 'random': '' });
  const [machineSelections, setMachineSelections] = useState<{ [key: string]: string }>({
    '6': 'M4',
    '10.5': 'M1',
    '24': 'M5',
    '12': '',
    'random': ''
  });
  const [allMachinesData, setAllMachinesData] = useState<{
    [key: string]: ScaledDye[];
  }>({});
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showAssignDateModal, setShowAssignDateModal] = useState(false);
  const [assignDate, setAssignDate] = useState<string>('');

  const showAlert = (title: string, message: string, onOk?: () => void) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
      if (onOk) onOk();
    } else {
      Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
    }
  };

  const handleSendToDailyTasks = async () => {
    if (cart.length === 0) {
      showAlert('Empty Cart', 'Please add recipes to the cart first.');
      return;
    }
    
    // Set initial date
    let activeDate = await AsyncStorage.getItem('active_working_date');
    const today = new Date().toISOString().split('T')[0];
    setAssignDate(activeDate || today);
    setShowAssignDateModal(true);
  };

  const processTaskSending = async () => {
    if (!assignDate) {
      showAlert('Error', 'Please select an assignment date.');
      return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    if (assignDate < today) {
      showAlert('Error', 'Cannot assign tasks to past dates.');
      return;
    }

    try {
      setIsSending(true);
      setShowAssignDateModal(false);
      
      // Save the date as active working date
      await AsyncStorage.setItem('active_working_date', assignDate);

      // Fetch current task for this date
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks/${assignDate}`);
      const data = await response.json();
      
      let existingTask = data.id ? data : { date: assignDate, m1: [], m2: [], m3: [], m4: [], m5: [], automatic_tasks: [] };

      // Map cart items to machine tasks
      cart.forEach(item => {
        const machineKey = item.machine.toLowerCase() as 'm1' | 'm2' | 'm3' | 'm4' | 'm5';
        const newTask = {
          id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 11),
          shade_id: item.id.split('-')[0], // Extract shade id from cart item id
          shade_number: item.shadeNumber,
          springs_2ply: parseInt(item.twoP || '0'),
          springs_3ply: parseInt(item.threeP || '0'),
          weight: item.weight,
          status: 'pending',
          type: 'cart-assigned',
          machine: item.machine
        };

        if (existingTask[machineKey]) {
          existingTask[machineKey].push(newTask);
        } else {
          existingTask[machineKey] = [newTask];
        }
      });

      // Save updated task
      const saveMethod = existingTask.id ? 'PUT' : 'POST';
      const saveUrl = existingTask.id 
        ? `${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks/${existingTask.id}`
        : `${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks`;

      const saveResponse = await fetch(saveUrl, {
        method: saveMethod,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(existingTask),
      });

      if (saveResponse.ok) {
        if (Platform.OS === 'web') {
          const confirmClear = window.confirm(`Tasks successfully assigned to ${assignDate}!\n\nDo you want to CLEAR the cart now?`);
          if (confirmClear) clearCart();
        } else {
          Alert.alert(
            'Success', 
            `Tasks successfully assigned to ${assignDate}!`,
            [
              { text: 'Clear Cart', onPress: () => clearCart() },
              { text: 'Keep Cart', style: 'cancel' }
            ]
          );
        }
      } else {
        const error = await saveResponse.json();
        throw new Error(error.detail || 'Failed to save tasks');
      }

    } catch (error: any) {
      showAlert('Error', error.message || 'Something went wrong while sending tasks.');
    } finally {
      setIsSending(false);
    }
  };

  const CART_STORAGE_KEY = 'bajaj_recipe_cart';

  // Load user role and cart on mount
  useEffect(() => {
    const initData = async () => {
      try {
        // 1. Get User Role
        const role = await AsyncStorage.getItem('userRole');
        setUserRole(role);

        // 2. Load from Local Storage first
        const stored = await AsyncStorage.getItem(CART_STORAGE_KEY);
        let initialCart = [];
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            initialCart = parsed;
            setCart(parsed);
          }
        }

        // 3. Sync from Backend if logged in
        if (role) {
          try {
            const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/cart/${role}`);
            const data = await response.json();
            if (data.items && Array.isArray(data.items)) {
              // Merge or overwrite? User wants "same cart should appear", so overwrite
              if (data.items.length > 0) {
                setCart(data.items);
                await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(data.items));
              }
            }
          } catch (e) {
            console.error('Error syncing cart from backend:', e);
          }
        }
      } catch (e) {
        console.error('Error in initData:', e);
      }
    };
    initData();
  }, []);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  // Save cart to AsyncStorage and Backend
  const syncCart = useCallback(async (updatedCart: CartItem[]) => {
    try {
      // Save locally
      await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(updatedCart));
      
      // Save to backend if user is logged in
      if (userRole) {
        setIsSyncing(true);
        try {
          await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/cart/${userRole}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatedCart),
          });
        } catch (e) {
          console.error('Error syncing to backend:', e);
        } finally {
          setIsSyncing(false);
        }
      }
    } catch (e) {
      console.error('Error saving cart:', e);
    }
  }, [userRole]);

  useEffect(() => {
    if (shadeId) {
      fetchShade();
      calculateAllMachines();
    }
  }, [shadeId]);

  const fetchShade = async () => {
    try {
      const response = await fetch(
        `${EXPO_PUBLIC_BACKEND_URL}/api/shades/${shadeId}`
      );
      const data = await response.json();
      setShade(data);
    } catch (error) {
      console.error('Error fetching shade:', error);
      Alert.alert('Error', 'Failed to load shade');
    } finally {
      setLoading(false);
    }
  };

  const getScaledRecipe = (weight: number): ScaledDye[] => {
    if (!shade) return [];
    return shade.dyes.map(dye => ({
      dye_name: dye.dye_name,
      quantity: (weight / shade.original_weight) * dye.quantity
    }));
  };

  const calculateAllMachines = async () => {
    try {
      const response = await fetch(
        `${EXPO_PUBLIC_BACKEND_URL}/api/calculate-all-machines?shade_id=${shadeId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await response.json();
      setAllMachinesData(data.machines);
    } catch (error) {
      console.error('Error calculating recipes:', error);
    }
  };

  const calculatePerKg = (quantity: number) => {
    if (!shade) return 0;
    return quantity / shade.original_weight;
  };

  const addToCart = () => {
    if (!shade) return;

    let currentWeight: number;
    let currentDyes: ScaledDye[];

    if (selectedMachine === 'random') {
      currentWeight = parseFloat(randomWeight);
      if (isNaN(currentWeight) || currentWeight <= 0) {
        Alert.alert('Error', 'Please enter a valid random weight');
        return;
      }
      currentDyes = getScaledRecipe(currentWeight);
    } else {
      currentWeight = selectedMachine;
      currentDyes = allMachinesData[selectedMachine] || getScaledRecipe(selectedMachine);
    }

    if (!currentDyes || currentDyes.length === 0) {
      Alert.alert('Error', 'Recipe data is missing. Please refresh and try again.');
      return;
    }

    const machine = machineSelections[selectedMachine.toString()];
    if (!machine) {
      Alert.alert('Selection Required', 'Please select a machine (M1-M5) for this batch.');
      return;
    }

    const cartItem: CartItem = {
      id: `${shade.id}-${currentWeight}-${Date.now()}`,
      shadeNumber: shade.shade_number,
      programNumber: shade.program_number || 'P1',
      weight: currentWeight,
      rc: shade.rc || 'No',
      machine: machine,
      originalWeight: shade.original_weight,
      twoP: selectedMachine === 'random' ? twoPValues['random'] : twoPValues[selectedMachine.toString()],
      threeP: selectedMachine === 'random' ? threePValues['random'] : threePValues[selectedMachine.toString()],
      dyes: currentDyes,
    };

    setCart(prev => {
      const newCart = [...prev, cartItem];
      syncCart(newCart);
      return newCart;
    });
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 1500);
  };

  const removeFromCart = (id: string) => {
    setCart(prev => {
      const newCart = prev.filter(item => item.id !== id);
      syncCart(newCart);
      return newCart;
    });
  };

  const clearCart = () => {
    const doClear = () => {
      setCart([]);
      syncCart([]);
    };
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Clear all items from cart?');
      if (confirmed) doClear();
    } else {
      Alert.alert('Clear Cart', 'Remove all items?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: doClear },
      ]);
    }
  };

  const handleBulkPrint = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Print', 'Bulk printing is only supported in the web version.');
      return;
    }

    // Always fetch latest data from backend before printing to ensure cross-device consistency
    let latestCart = cart;
    if (userRole) {
      setIsSyncing(true);
      try {
        const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/cart/${userRole}`);
        const data = await response.json();
        if (data.items && Array.isArray(data.items)) {
          latestCart = data.items;
          setCart(latestCart);
          await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(latestCart));
        }
      } catch (e) {
        console.warn('Backend sync failed before print, using local data', e);
      } finally {
        setIsSyncing(false);
      }
    }

    if (latestCart.length === 0) {
      Alert.alert('Print', 'Cart is empty. Nothing to print.');
      return;
    }

    // Define sort order
    const machineOrder = ["M1", "M2", "M3", "M4", "M5"];

    // Group items by their selected machine using the LATEST data
    const grouped = latestCart.reduce((acc: { [key: string]: CartItem[] }, item) => {
      const machine = item.machine || 'Other';
      if (!acc[machine]) acc[machine] = [];
      acc[machine].push(item);
      return acc;
    }, {});

    // Build print HTML
    const printHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Bajaj Dyeing - Sorted Recipe Print</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 5mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-size: 18pt !important;
      font-weight: bold !important;
      color: #000 !important;
      border-color: #000 !important;
    }
    body {
      font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #fff;
      line-height: 1.3;
      padding: 10px;
    }
    .print-container {
      width: 100%;
    }
    .machine-wrapper {
      width: 100%;
      border-collapse: collapse;
      page-break-after: always;
      margin-bottom: 30px;
    }
    .machine-wrapper:last-child {
      page-break-after: auto;
    }
    .machine-thead {
      display: table-header-group;
    }
    .machine-header-cell {
      padding: 0;
      border: none;
    }
    .machine-header {
      text-align: center;
      padding: 15px;
      border: 6px solid #000;
      margin-bottom: 25px;
      background: #eee;
      text-transform: uppercase;
      letter-spacing: 4px;
      width: 100%;
    }
    .recipes-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 25px;
      padding-top: 10px;
    }
    .recipe-card {
      border: 3px solid #000;
      padding: 15px;
      page-break-inside: avoid;
      display: flex;
      flex-direction: column;
      margin-bottom: 15px;
    }
    .recipe-header {
      border-bottom: 3px solid #000;
      padding-bottom: 8px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .shade-name {
      text-transform: uppercase;
    }
    .p-counts {
      margin-bottom: 10px;
    }
    .weight-tag {
      border: 3px solid #000;
      padding: 4px 12px;
    }
    .scaled-info {
      margin-bottom: 10px;
    }
    .recipe-table {
      width: 100%;
      border-collapse: collapse;
    }
    .recipe-table th {
      text-align: left;
      border-bottom: 2px solid #000;
      padding-bottom: 6px;
      text-transform: uppercase;
    }
    .recipe-table td {
      padding: 8px 0;
      border-bottom: 1px solid #ddd;
    }
    .qty-cell {
      text-align: right;
      font-family: monospace;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      padding-top: 15px;
      border-top: 2px solid #000;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="print-container">
    ${machineOrder.filter(m => grouped[m]).map(machine => `
      <table class="machine-wrapper">
        <thead class="machine-thead">
          <tr>
            <th class="machine-header-cell">
              <div class="machine-header">=== ${machine} ===</div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div class="recipes-grid">
                ${grouped[machine].map(item => `
                  <div class="recipe-card">
                    <div class="recipe-header">
                      <div class="recipe-title">
                        <span class="shade-name" style="color: #000;">${item.shadeNumber}</span>
                         <span class="tags">
                          ${item.programNumber} 
                          ${item.rc === 'Yes' ? 'RC' : ''}
                        </span>
                      </div>
                      <div class="weight-tag">${item.weight} kg</div>
                    </div>
                    <div class="p-counts">
                      2P: ${item.twoP || '0'} &nbsp;&nbsp;&nbsp; 3P: ${item.threeP || '0'}
                    </div>
                    <div class="scaled-info">Scaled to: ${item.weight} kg</div>
                    <table class="recipe-table">
                      <thead>
                        <tr>
                          <th>Dye / Chemical</th>
                          <th style="text-align: right;">QTY (gm)</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${(item.dyes && item.dyes.length > 0) ? item.dyes.map(dye => `
                          <tr>
                            <td>${dye.dye_name}</td>
                            <td class="qty-cell">${dye.quantity.toFixed(3)}<span class="unit">gm</span></td>
                          </tr>
                        `).join('') : `
                          <tr>
                            <td colspan="2" style="text-align: center; color: #D32F2F; font-weight: 900; padding: 20px;">
                              ⚠️ DATA MISSING (Sync Error) <br/>
                              Please re-add this recipe to your cart.
                            </td>
                          </tr>
                        `}
                      </tbody>
                    </table>
                  </div>
                `).join('')}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    `).join('')}
    <div class="footer">
      Generated on: ${new Date().toLocaleString()} | Bajaj Dyeing Unit
    </div>
  </div>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
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

  if (!shade) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />
        <View style={styles.centerContent}>
          <Text style={[styles.errorText, { color: colors.danger }]}>Shade not found</Text>
          <TouchableOpacity
            style={[styles.goBackButton, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.goBackButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />

      {/* Header with Cart */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, shadowColor: colors.shadow }]}>
        <TouchableOpacity onPress={handleBack}>
          <Text style={[styles.backLink, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Recipe Calculator</Text>
        <TouchableOpacity
          style={[styles.cartButton, { backgroundColor: cart.length > 0 ? colors.primary : colors.inputBackground }]}
          onPress={() => setShowCart(true)}
        >
          <Text style={[styles.cartButtonText, { color: cart.length > 0 ? '#fff' : colors.textSecondary }]}>
            🛒 {cart.length}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Shade Info */}
        <View style={[styles.shadeInfoCard, { backgroundColor: colors.card, borderColor: colors.primary, shadowColor: colors.shadow }]}>
          <View style={styles.shadeHeader}>
            <Text style={styles.shadeNumber}>Shade #{shade.shade_number}</Text>
            <View style={styles.badgeRow}>
              {shade.rc === 'Yes' && (
                <View style={[styles.rcBadge]}>
                  <Text style={styles.rcBadgeText}>RC</Text>
                </View>
              )}
              <View style={styles.programBadge}>
                <Text style={styles.programText}>{shade.program_number || 'P1'}</Text>
              </View>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Original Weight:</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{shade.original_weight} kg</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Number of Dyes:</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{shade.dyes.length}</Text>
          </View>
        </View>

        {/* Weight Selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>⚖️ Select Weight</Text>
          <View style={styles.machineButtons}>
            {MACHINE_WEIGHTS.map((weight) => (
              <View key={weight} style={styles.weightColumn}>
                <TouchableOpacity
                  style={[
                    styles.machineButton,
                    { backgroundColor: colors.inputBackground, borderColor: colors.border },
                    selectedMachine === weight && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setSelectedMachine(weight)}
                >
                  <Text
                    style={[
                      styles.machineButtonText,
                      { color: colors.textSecondary, marginBottom: 2 },
                      selectedMachine === weight && { color: '#fff' },
                    ]}
                  >
                    {weight} kg
                  </Text>
                  <Text style={[styles.machineMappingText, { color: selectedMachine === weight ? 'rgba(255,255,255,0.8)' : colors.textSecondary }]}>
                    ({weight === 12 ? (machineSelections['12'] || 'Select M') : MACHINE_MAPPING[weight]})
                  </Text>
                </TouchableOpacity>

                {/* Machine Selector for 12kg */}
                {selectedMachine === 12 && weight === 12 && (
                  <View style={styles.subMachineButtons}>
                    {['M2', 'M3'].map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.subMachineButton,
                          { backgroundColor: colors.inputBackground, borderColor: colors.border },
                          machineSelections['12'] === m && { backgroundColor: colors.accent, borderColor: colors.accent },
                        ]}
                        onPress={() => setMachineSelections(prev => ({ ...prev, '12': m }))}
                      >
                        <Text style={[styles.subMachineButtonText, { color: machineSelections['12'] === m ? '#fff' : colors.text }]}>
                          {m}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                
                {/* 2P / 3P Inputs */}
                <View style={styles.pInputRow}>
                  <View style={styles.pInputWrapper}>
                    <Text style={[styles.pInputLabel, { color: colors.textSecondary }]}>2P</Text>
                    <TextInput
                      style={[styles.pInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                      value={twoPValues[weight.toString()]}
                      onChangeText={(val) => setTwoPValues(prev => ({ ...prev, [weight.toString()]: val }))}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                  <View style={styles.pInputWrapper}>
                    <Text style={[styles.pInputLabel, { color: colors.textSecondary }]}>3P</Text>
                    <TextInput
                      style={[styles.pInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                      value={threePValues[weight.toString()]}
                      onChangeText={(val) => setThreePValues(prev => ({ ...prev, [weight.toString()]: val }))}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                </View>
              </View>
            ))}

            {/* Random Weight Button */}
            <View style={styles.weightColumn}>
              <TouchableOpacity
                style={[
                  styles.machineButton,
                  { backgroundColor: colors.inputBackground, borderColor: colors.border },
                  selectedMachine === 'random' && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
                onPress={() => setSelectedMachine('random')}
              >
                <Text
                  style={[
                    styles.machineButtonText,
                    { color: colors.textSecondary },
                    selectedMachine === 'random' && { color: '#fff' },
                  ]}
                >
                  Random
                </Text>
                {selectedMachine === 'random' && (
                   <Text style={[styles.machineMappingText, { color: '#fff' }]}>Custom</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Random Weight Input Box */}
          {selectedMachine === 'random' && (
            <View style={styles.randomInputContainer}>
              <Text style={[styles.randomInputLabel, { color: colors.textSecondary }]}>Enter Custom Weight (kg):</Text>
              <TextInput
                style={[styles.randomInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.accent }]}
                value={randomWeight}
                onChangeText={setRandomWeight}
                keyboardType="numeric"
                placeholder="e.g. 15.5"
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />

              {/* Machine Selector for Random Weight */}
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 8, textAlign: 'center' }}>
                  Assign to Machine:
                </Text>
                <View style={styles.subMachineButtons}>
                  {['M1', 'M2', 'M3', 'M4', 'M5'].map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.subMachineButton,
                        { backgroundColor: colors.inputBackground, borderColor: colors.border },
                        machineSelections['random'] === m && { backgroundColor: colors.accent, borderColor: colors.accent },
                      ]}
                      onPress={() => setMachineSelections(prev => ({ ...prev, 'random': m }))}
                    >
                      <Text style={[styles.subMachineButtonText, { color: machineSelections['random'] === m ? '#fff' : colors.text }]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Random Weight 2P / 3P */}
              <View style={[styles.pInputRow, { marginTop: 12 }]}>
                <View style={styles.pInputWrapper}>
                  <Text style={[styles.pInputLabel, { color: colors.textSecondary }]}>2P</Text>
                  <TextInput
                    style={[styles.pInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                    value={twoPValues['random']}
                    onChangeText={(val) => setTwoPValues(prev => ({ ...prev, 'random': val }))}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={styles.pInputWrapper}>
                  <Text style={[styles.pInputLabel, { color: colors.textSecondary }]}>3P</Text>
                  <TextInput
                    style={[styles.pInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                    value={threePValues['random']}
                    onChangeText={(val) => setThreePValues(prev => ({ ...prev, 'random': val }))}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Scaled Recipe for Selected Machine */}
        {(selectedMachine === 'random' ? (parseFloat(randomWeight) > 0) : !!allMachinesData[selectedMachine]) && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
                📋 Recipe for {selectedMachine === 'random' ? randomWeight : selectedMachine} kg
              </Text>
              <TouchableOpacity
                style={[
                  styles.addToCartButton,
                  { backgroundColor: addedFeedback ? colors.success : colors.primary },
                ]}
                onPress={addToCart}
              >
                <Text style={styles.addToCartButtonText}>
                  {addedFeedback ? '✓ Added' : '+ Add to Cart'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.recipeCard, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
              {/* Recipe List */}
              {(selectedMachine === 'random' ? getScaledRecipe(parseFloat(randomWeight)) : (allMachinesData[selectedMachine] || getScaledRecipe(selectedMachine))).map((dye, index) => (
                <View key={index} style={[styles.scaledDyeRow, { borderLeftColor: colors.primary, backgroundColor: colors.background }]}>
                  <Text style={[styles.scaledDyeName, { color: colors.text }]}>{dye.dye_name}</Text>
                  <View style={styles.scaledDyeQuantityContainer}>
                    <Text style={[styles.scaledDyeQuantity, { color: colors.primary }]}>{dye.quantity.toFixed(3)}</Text>
                    <Text style={[styles.unitText, { color: colors.textSecondary }]}> gm</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Original Recipe */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            📝 Original Recipe ({shade.original_weight} kg)
          </Text>
          {shade.dyes.map((dye, index) => (
            <View key={index} style={[styles.dyeRow, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <View style={[styles.dyeNameBadge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.dyeName, { color: colors.primary }]}>{dye.dye_name}</Text>
              </View>
              <View style={styles.dyeQuantities}>
                <Text style={[styles.dyeQuantity, { color: colors.primary }]}>{dye.quantity.toFixed(3)} gm</Text>
                <Text style={[styles.dyePerKg, { color: colors.textSecondary }]}>
                  ({calculatePerKg(dye.quantity).toFixed(3)} gm/kg)
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* All Machines Table */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>📊 All Machines Comparison</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={[styles.table, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              {/* Table Header */}
              <View style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.tableCell, styles.headerCell, styles.dyeNameCell, { backgroundColor: colors.inputBackground }]}>
                  <Text style={[styles.headerText, { color: colors.text }]}>Dye Name</Text>
                </View>
                {MACHINE_WEIGHTS.map((weight) => (
                  <View
                    key={weight}
                    style={[styles.tableCell, styles.headerCell, styles.machineCell, { backgroundColor: colors.inputBackground }]}
                  >
                    <Text style={[styles.headerText, { color: colors.text }]}>{weight} kg</Text>
                  </View>
                ))}
                {selectedMachine === 'random' && parseFloat(randomWeight) > 0 && (
                  <View style={[styles.tableCell, styles.headerCell, styles.machineCell, { backgroundColor: colors.accent + '22' }]}>
                    <Text style={[styles.headerText, { color: colors.accent }]}>{randomWeight} kg</Text>
                  </View>
                )}
              </View>

              {/* Table Rows */}
              {shade.dyes.map((dye, index) => (
                <View key={index} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                  <View style={[styles.tableCell, styles.dyeNameCell]}>
                    <View style={[styles.dyeNameBadgeSmall, { backgroundColor: colors.primaryLight }]}>
                      <Text style={[styles.tableCellText, { color: colors.primary, fontWeight: '600' }]}>{dye.dye_name}</Text>
                    </View>
                  </View>
                  {MACHINE_WEIGHTS.map((weight) => {
                    const scaledDye = allMachinesData[weight]?.find(
                      (d) => d.dye_name === dye.dye_name
                    );
                    return (
                      <View
                        key={weight}
                        style={[
                          styles.tableCell,
                          styles.machineCell,
                          selectedMachine === weight && { backgroundColor: colors.primary },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tableCellText,
                            { color: colors.text },
                            selectedMachine === weight && { color: '#fff', fontWeight: 'bold' },
                          ]}
                        >
                          {scaledDye?.quantity.toFixed(2) || '0.00'}
                        </Text>
                      </View>
                    );
                  })}
                  {selectedMachine === 'random' && parseFloat(randomWeight) > 0 && (
                    <View style={[styles.tableCell, styles.machineCell, { backgroundColor: colors.accent + '11' }]}>
                      <Text style={[styles.tableCellText, { color: colors.accent, fontWeight: 'bold' }]}>
                        {((parseFloat(randomWeight) / shade.original_weight) * dye.quantity).toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      {/* Cart Modal */}
      <Modal
        visible={showCart}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCart(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.cartModal, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
            {/* Cart Header */}
            <View style={[styles.cartHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.cartTitle, { color: colors.text }]}>🛒 Recipe Cart ({cart.length})</Text>
              <TouchableOpacity onPress={() => setShowCart(false)} style={styles.cartCloseBtn}>
                <Text style={[styles.cartCloseBtnText, { color: colors.danger }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {cart.length === 0 ? (
              <View style={styles.cartEmpty}>
                <Text style={[styles.cartEmptyText, { color: colors.textSecondary }]}>
                  Cart is empty. Add recipes from the calculator!
                </Text>
              </View>
            ) : (
              <>
                <ScrollView style={styles.cartList}>
                  {cart.map((item, index) => (
                    <View key={item.id} style={[styles.cartItem, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={styles.cartItemHeader}>
                        <View style={styles.cartItemInfo}>
                          <Text style={[styles.cartItemShade, { color: colors.primary }]}>
                            Shade #{item.shadeNumber}
                          </Text>
                          <View style={[styles.cartWeightBadge, { backgroundColor: colors.primary }]}>
                            <Text style={styles.cartWeightBadgeText}>{item.weight} kg</Text>
                          </View>
                          <View style={[styles.cartProgramBadge, { backgroundColor: '#FF9800' }]}>
                            <Text style={styles.cartProgramBadgeText}>{item.programNumber}</Text>
                          </View>
                          {item.rc === 'Yes' && (
                            <View style={[styles.cartRcBadge, { backgroundColor: '#805AD5' }]}>
                              <Text style={styles.cartRcBadgeText}>RC</Text>
                            </View>
                          )}
                          {(item.twoP || item.threeP) && (
                            <View style={[styles.cartBadge, { backgroundColor: colors.secondary }]}>
                              <Text style={styles.cartBadgeText}>
                                {item.twoP ? `2P:${item.twoP}` : ''} {item.threeP ? `3P:${item.threeP}` : ''}
                              </Text>
                            </View>
                          )}
                        </View>
                        <TouchableOpacity
                          style={[styles.cartRemoveBtn, { backgroundColor: colors.danger }]}
                          onPress={() => removeFromCart(item.id)}
                        >
                          <Text style={styles.cartRemoveBtnText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.cartItemDyes}>
                        {item.dyes.slice(0, 4).map((dye, dIdx) => (
                          <View key={dIdx} style={styles.cartDyeRow}>
                            <Text style={[styles.cartDyeName, { color: colors.text }]} numberOfLines={1}>{dye.dye_name}</Text>
                            <Text style={[styles.cartDyeQty, { color: colors.primary }]}>{dye.quantity.toFixed(2)} gm</Text>
                          </View>
                        ))}
                        {item.dyes.length > 4 && (
                          <Text style={[styles.cartMoreText, { color: colors.textSecondary }]}>
                            +{item.dyes.length - 4} more dyes...
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </ScrollView>

                <View style={[styles.cartFooter, { borderTopColor: colors.border }]}>
                  <TouchableOpacity
                    style={[styles.clearCartButton, { backgroundColor: colors.danger }]}
                    onPress={clearCart}
                  >
                    <Text style={styles.clearCartButtonText}>🗑 Clear All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.sendTasksButton, 
                      { backgroundColor: colors.success },
                      isSending && { opacity: 0.7 }
                    ]}
                    onPress={handleSendToDailyTasks}
                    disabled={isSending}
                  >
                    <Text style={styles.printAllButtonText}>
                      {isSending ? '⌛ Sending...' : '🚀 Send to Daily Tasks'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.printAllButton, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      setShowCart(false);
                      handleBulkPrint();
                    }}
                  >
                    <Text style={styles.printAllButtonText}>🖨️ Print All</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Date Selection Modal */}
      <Modal visible={showAssignDateModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.cartModal, { backgroundColor: colors.background, padding: 24, maxWidth: 400 }]}>
            <Text style={[styles.cartTitle, { color: colors.text, marginBottom: 20, textAlign: 'center' }]}>
              Select Assignment Date
            </Text>
            
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 8, fontWeight: '600' }}>
                Assignment Date
              </Text>
              <TextInput
                style={{
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 16,
                  color: colors.text,
                  backgroundColor: colors.inputBackground,
                  textAlign: 'center',
                  fontWeight: 'bold'
                }}
                value={assignDate}
                onChangeText={setAssignDate}
                placeholder="YYYY-MM-DD"
              />
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>
                Format: YYYY-MM-DD
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' }}
                onPress={() => setShowAssignDateModal(false)}
              >
                <Text style={{ color: '#475569', fontSize: 15, fontWeight: 'bold' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.success, alignItems: 'center', opacity: isSending ? 0.7 : 1 }}
                onPress={processTaskSending}
                disabled={isSending}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: 'bold' }}>
                  {isSending ? 'Sending...' : 'Confirm'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  backLink: {
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 12,
  },
  cartButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    minWidth: 60,
    alignItems: 'center',
  },
  cartButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  shadeInfoCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  shadeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  shadeNumber: {
    fontSize: 28,
    fontWeight: '900',
    flex: 1,
    color: '#000',
    letterSpacing: 0.5,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  programBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  programText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  rcBadge: {
    backgroundColor: '#805AD5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rcBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  addToCartButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  addToCartButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  dyeRow: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dyeName: {
    fontSize: 15,
    flex: 1,
    fontWeight: '700',
  },
  dyeNameBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    flex: 1,
    marginRight: 10,
  },
  dyeNameBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dyeQuantities: {
    alignItems: 'flex-end',
  },
  dyeQuantity: {
    fontSize: 15,
    fontWeight: '600',
  },
  dyePerKg: {
    fontSize: 11,
    marginTop: 2,
  },
  machineButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  machineButton: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    minHeight: 60,
    justifyContent: 'center',
  },
  machineButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  machineMappingText: {
    fontSize: 11,
    fontWeight: '600',
  },
  weightColumn: {
    flex: 1,
    minWidth: 80,
    gap: 8,
  },
  pInputRow: {
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'space-between',
  },
  pInputWrapper: {
    flex: 1,
  },
  pInputLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 2,
    textAlign: 'center',
  },
  pInput: {
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 12,
    textAlign: 'center',
    padding: 0,
  },
  randomInputContainer: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#ccc',
  },
  randomInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  randomInput: {
    height: 45,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 15,
    fontSize: 16,
    fontWeight: '600',
  },
  recipeCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eee',
  },
  scaledDyeRow: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
  },
  scaledDyeName: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  scaledDyeQuantityContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scaledDyeQuantity: {
    fontSize: 18,
    fontWeight: '900',
  },
  unitText: {
    fontSize: 12,
    fontWeight: '600',
  },
  machineButtonCheck: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
  },
  table: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tableCell: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCell: {},
  dyeNameCell: {
    width: 140,
    alignItems: 'flex-start',
  },
  machineCell: {
    width: 80,
  },
  headerText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  tableCellText: {
    fontSize: 14,
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
  errorText: {
    fontSize: 18,
    marginBottom: 20,
  },
  goBackButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  goBackButtonText: {
    color: '#fff',
    fontWeight: '600',
  },

  // Cart Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cartModal: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    borderRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  cartTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  cartCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
  },
  cartCloseBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  cartEmpty: {
    padding: 40,
    alignItems: 'center',
  },
  cartEmptyText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  cartList: {
    maxHeight: 400,
    padding: 16,
  },
  cartItem: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  cartItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cartItemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  cartItemShade: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  cartWeightBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cartWeightBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  cartProgramBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cartProgramBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  cartRcBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cartRcBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  cartRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartRemoveBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  cartItemDyes: {
    gap: 4,
  },
  cartDyeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  cartDyeName: {
    fontSize: 13,
    flex: 1,
  },
  cartDyeQty: {
    fontSize: 13,
    fontWeight: '600',
  },
  cartMoreText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  cartFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
  },
  clearCartButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  clearCartButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  sendTasksButton: {
    flex: 1.8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  printAllButton: {
    flex: 1.2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  printAllButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  cartBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  subMachineButtons: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 4,
    justifyContent: 'center',
  },
  subMachineButton: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 40,
    alignItems: 'center',
  },
  subMachineButtonText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
});
