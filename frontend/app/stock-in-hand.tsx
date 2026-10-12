import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Platform,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getBackendBaseUrl } from '../lib/api-base';
import { useTheme } from '../context/ThemeContext';

const EXPO_PUBLIC_BACKEND_URL = getBackendBaseUrl();

interface PendingTaskItem {
  task_id: string;
  daily_task_id: string;
  date: string;
  machine: string;
  machine_id: string;
  shade_number: string;
  springs_2ply: number;
  springs_3ply: number;
  weight: number;
  ply2_weight: number;
  ply3_weight: number;
  status: string;
  assigned_to: string;
  can_modify: boolean;
}

interface ManualEntryItem {
  id: string;
  date: string;
  ply2_kg: number;
  ply3_kg: number;
  total_kg: number;
  notes: string;
  created_at: string;
}

interface ShadeStockItem {
  shade_number: string;
  shade_id: string | null;
  program_number: string;
  rc: string;
  completed_2ply_kg: number;
  completed_3ply_kg: number;
  completed_total_kg: number;
  completed_springs_2ply: number;
  completed_springs_3ply: number;
  completed_batches: number;
  manual_2ply_kg: number;
  manual_3ply_kg: number;
  manual_total_kg: number;
  manual_entries: ManualEntryItem[];
  current_stock_2ply_kg: number;
  current_stock_3ply_kg: number;
  current_stock_total_kg: number;
  pending_2ply_kg: number;
  pending_3ply_kg: number;
  pending_total_kg: number;
  pending_springs_2ply: number;
  pending_springs_3ply: number;
  pending_batches: number;
  pending_tasks: PendingTaskItem[];
  last_batch_date: string | null;
}

interface StockInHandResponse {
  filters: {
    as_of_date: string | null;
    from_date: string | null;
    to_date: string | null;
    search: string | null;
  };
  summary: {
    total_stock_kg: number;
    total_2ply_kg: number;
    total_3ply_kg: number;
    total_completed_springs_2ply: number;
    total_completed_springs_3ply: number;
    total_pending_kg: number;
    total_pending_batches: number;
    total_shades_count: number;
    in_stock_shades_count: number;
  };
  shades: ShadeStockItem[];
}

export default function StockInHandScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [stockData, setStockData] = useState<StockInHandResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'in_stock' | 'pending' | '2ply' | '3ply'>('all');
  
  // Date filter
  const [dateFilterMode, setDateFilterMode] = useState<'all' | 'today' | 'custom'>('all');
  const [customDate, setCustomDate] = useState('');

  // Expand shade details state
  const [expandedShades, setExpandedShades] = useState<Record<string, boolean>>({});

  // Manual Stock Modal State
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualShade, setManualShade] = useState('');
  const [manualPly2, setManualPly2] = useState('');
  const [manualPly3, setManualPly3] = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualNotes, setManualNotes] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);

  // Edit Pending Task Modal State
  const [editTaskModalVisible, setEditTaskModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<PendingTaskItem | null>(null);
  const [taskShadeNumber, setTaskShadeNumber] = useState('');
  const [taskSprings2Ply, setTaskSprings2Ply] = useState('');
  const [taskSprings3Ply, setTaskSprings3Ply] = useState('');
  const [taskPly2Weight, setTaskPly2Weight] = useState('');
  const [taskPly3Weight, setTaskPly3Weight] = useState('');
  const [taskTotalWeight, setTaskTotalWeight] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  useEffect(() => {
    fetchStockData();
  }, [dateFilterMode, customDate]);

  const fetchStockData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (dateFilterMode === 'today') {
        const todayStr = new Date().toISOString().split('T')[0];
        params.append('as_of_date', todayStr);
      } else if (dateFilterMode === 'custom' && customDate.trim()) {
        params.append('as_of_date', customDate.trim());
      }
      
      const url = `${EXPO_PUBLIC_BACKEND_URL}/api/stock-in-hand?${params.toString()}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setStockData(data);
      } else {
        showAlert('Error', 'Failed to load stock in hand data');
      }
    } catch (error) {
      console.error('Error fetching stock data:', error);
      showAlert('Error', 'Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const toggleExpand = (shadeNumber: string) => {
    setExpandedShades(prev => ({
      ...prev,
      [shadeNumber]: !prev[shadeNumber],
    }));
  };

  // Open Manual Entry Modal
  const openManualModal = (prefillShade = '') => {
    setManualShade(prefillShade);
    setManualPly2('');
    setManualPly3('');
    setManualDate(new Date().toISOString().split('T')[0]);
    setManualNotes('');
    setManualModalVisible(true);
  };

  // Submit Manual Entry
  const handleSaveManualStock = async () => {
    if (!manualShade.trim()) {
      showAlert('Missing Shade', 'Please enter a shade number');
      return;
    }
    const p2 = parseFloat(manualPly2 || '0');
    const p3 = parseFloat(manualPly3 || '0');
    if (isNaN(p2) || isNaN(p3) || (p2 === 0 && p3 === 0)) {
      showAlert('Invalid Quantity', 'Please enter 2-PLY kg and/or 3-PLY kg');
      return;
    }

    try {
      setSubmittingManual(true);
      const payload = {
        shade_number: manualShade.trim(),
        ply2_kg: p2,
        ply3_kg: p3,
        date: manualDate || new Date().toISOString().split('T')[0],
        notes: manualNotes.trim() || 'Manual stock entry',
      };

      const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/stock-in-hand/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setManualModalVisible(false);
        showAlert('Success', `Stock recorded for Shade #${manualShade}`);
        fetchStockData();
      } else {
        const err = await res.json();
        showAlert('Error', err.detail || 'Failed to save manual stock');
      }
    } catch (error) {
      showAlert('Error', 'Network error while saving stock');
    } finally {
      setSubmittingManual(false);
    }
  };

  // Delete Manual Entry
  const handleDeleteManualEntry = async (entryId: string) => {
    const confirmDelete = Platform.OS === 'web' 
      ? window.confirm('Delete this manual stock adjustment?')
      : true;

    if (!confirmDelete) return;

    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/stock-in-hand/manual/${entryId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showAlert('Deleted', 'Manual stock entry removed');
        fetchStockData();
      } else {
        showAlert('Error', 'Could not delete entry');
      }
    } catch (error) {
      showAlert('Error', 'Network error');
    }
  };

  // Open Edit Pending Task Modal
  const openEditPendingTaskModal = (task: PendingTaskItem) => {
    if (task.status === 'completed') {
      showAlert('Locked', 'This batch has already been completed and confirmed. Changes are locked.');
      return;
    }
    setEditingTask(task);
    setTaskShadeNumber(task.shade_number);
    setTaskSprings2Ply(task.springs_2ply.toString());
    setTaskSprings3Ply(task.springs_3ply.toString());
    setTaskPly2Weight(task.ply2_weight > 0 ? task.ply2_weight.toString() : '');
    setTaskPly3Weight(task.ply3_weight > 0 ? task.ply3_weight.toString() : '');
    setTaskTotalWeight(task.weight > 0 ? task.weight.toString() : '');
    setEditTaskModalVisible(true);
  };

  // Save Modified Pending Task
  const handleSaveModifiedTask = async () => {
    if (!editingTask) return;
    if (!taskShadeNumber.trim()) {
      showAlert('Missing Shade', 'Please enter a shade number');
      return;
    }

    try {
      setSavingTask(true);
      const payload = {
        daily_task_id: editingTask.daily_task_id,
        machine_id: editingTask.machine_id,
        lot_id: editingTask.task_id,
        shade_number: taskShadeNumber.trim(),
        springs_2ply: parseInt(taskSprings2Ply || '0', 10),
        springs_3ply: parseInt(taskSprings3Ply || '0', 10),
        ply2_weight: taskPly2Weight ? parseFloat(taskPly2Weight) : undefined,
        ply3_weight: taskPly3Weight ? parseFloat(taskPly3Weight) : undefined,
        weight: taskTotalWeight ? parseFloat(taskTotalWeight) : undefined,
      };

      const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/stock-in-hand/modify-pending-task`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setEditTaskModalVisible(false);
        showAlert('Updated', 'Pending task batch updated successfully');
        fetchStockData();
      } else {
        const err = await res.json();
        showAlert('Change Not Allowed', err.detail || 'Could not update task');
      }
    } catch (error) {
      showAlert('Error', 'Network error');
    } finally {
      setSavingTask(false);
    }
  };

  // Filtered Shades List
  const filteredShades = (stockData?.shades || []).filter(item => {
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase().replace('#', '');
      if (!item.shade_number.toLowerCase().includes(q)) return false;
    }
    // Tab filters
    if (filterTab === 'in_stock') return item.current_stock_total_kg > 0;
    if (filterTab === 'pending') return item.pending_batches > 0;
    if (filterTab === '2ply') return item.current_stock_2ply_kg > 0;
    if (filterTab === '3ply') return item.current_stock_3ply_kg > 0;
    return true;
  });

  const handlePrint = () => {
    if (Platform.OS === 'web') {
      window.print();
    } else {
      showAlert('Print Report', 'Please open web portal to print this stock report.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />

      {/* HEADER */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.secondary + '20' }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.backButtonText, { color: colors.secondary }]}>← Back</Text>
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>📦 Stock in Hand</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              Ascending Shade-wise | 2-PLY & 3-PLY Consolidated Inventory
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
            onPress={() => openManualModal()}
          >
            <Text style={styles.actionBtnText}>➕ Manual Stock</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#2B6CB0' }]}
            onPress={handlePrint}
          >
            <Text style={styles.actionBtnText}>🖨️ Print</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* TOP KPI CARDS */}
        {stockData && (
          <View style={styles.kpiRow}>
            {/* Total Stock in Hand */}
            <View style={[styles.kpiCard, { backgroundColor: '#064E3B', borderColor: '#10B981' }]}>
              <Text style={styles.kpiLabel}>TOTAL STOCK IN HAND</Text>
              <Text style={styles.kpiValue}>
                {stockData.summary.total_stock_kg.toFixed(1)}{' '}
                <Text style={styles.kpiUnit}>KG</Text>
              </Text>
              <Text style={styles.kpiSub}>
                {stockData.summary.in_stock_shades_count} / {stockData.summary.total_shades_count} Shades Available
              </Text>
            </View>

            {/* 2-PLY Stock */}
            <View style={[styles.kpiCard, { backgroundColor: '#1E3A8A', borderColor: '#3B82F6' }]}>
              <Text style={styles.kpiLabel}>2-PLY STOCK IN HAND</Text>
              <Text style={styles.kpiValue}>
                {stockData.summary.total_2ply_kg.toFixed(1)}{' '}
                <Text style={styles.kpiUnit}>KG</Text>
              </Text>
              <Text style={styles.kpiSub}>
                {stockData.summary.total_completed_springs_2ply} Springs Ready
              </Text>
            </View>

            {/* 3-PLY Stock */}
            <View style={[styles.kpiCard, { backgroundColor: '#581C87', borderColor: '#A855F7' }]}>
              <Text style={styles.kpiLabel}>3-PLY STOCK IN HAND</Text>
              <Text style={styles.kpiValue}>
                {stockData.summary.total_3ply_kg.toFixed(1)}{' '}
                <Text style={styles.kpiUnit}>KG</Text>
              </Text>
              <Text style={styles.kpiSub}>
                {stockData.summary.total_completed_springs_3ply} Springs Ready
              </Text>
            </View>

            {/* In-Progress / Pending */}
            <View style={[styles.kpiCard, { backgroundColor: '#78350F', borderColor: '#F59E0B' }]}>
              <Text style={styles.kpiLabel}>IN-PROGRESS / PENDING</Text>
              <Text style={styles.kpiValue}>
                {stockData.summary.total_pending_kg.toFixed(1)}{' '}
                <Text style={styles.kpiUnit}>KG</Text>
              </Text>
              <Text style={styles.kpiSub}>
                {stockData.summary.total_pending_batches} Lots Running (Can Change)
              </Text>
            </View>
          </View>
        )}

        {/* CONTROLS & FILTERS BAR */}
        <View style={[styles.controlsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Date Filter Selection */}
          <View style={styles.filterSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>📅 Stock Date Filter:</Text>
            <View style={styles.filterButtonGroup}>
              <TouchableOpacity
                style={[
                  styles.filterToggleBtn,
                  dateFilterMode === 'all' && styles.filterToggleBtnActive,
                ]}
                onPress={() => setDateFilterMode('all')}
              >
                <Text
                  style={[
                    styles.filterToggleText,
                    dateFilterMode === 'all' && styles.filterToggleTextActive,
                  ]}
                >
                  All Time (Current)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterToggleBtn,
                  dateFilterMode === 'today' && styles.filterToggleBtnActive,
                ]}
                onPress={() => setDateFilterMode('today')}
              >
                <Text
                  style={[
                    styles.filterToggleText,
                    dateFilterMode === 'today' && styles.filterToggleTextActive,
                  ]}
                >
                  As of Today
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterToggleBtn,
                  dateFilterMode === 'custom' && styles.filterToggleBtnActive,
                ]}
                onPress={() => setDateFilterMode('custom')}
              >
                <Text
                  style={[
                    styles.filterToggleText,
                    dateFilterMode === 'custom' && styles.filterToggleTextActive,
                  ]}
                >
                  Custom As of Date
                </Text>
              </TouchableOpacity>
            </View>

            {dateFilterMode === 'custom' && (
              <View style={styles.customDateRow}>
                <TextInput
                  style={[styles.dateInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                  placeholder="YYYY-MM-DD (e.g. 2026-10-12)"
                  placeholderTextColor={colors.textSecondary}
                  value={customDate}
                  onChangeText={setCustomDate}
                />
                <TouchableOpacity
                  style={[styles.applyDateBtn, { backgroundColor: colors.primary }]}
                  onPress={fetchStockData}
                >
                  <Text style={styles.applyDateText}>Apply Date</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Search & Tabs */}
          <View style={styles.searchAndTabsRow}>
            <View style={[styles.searchBox, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search Shade number (e.g. 219, 10, 1)..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Text style={styles.clearSearchText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.tabRow}>
              {[
                { key: 'all', label: `All (${stockData?.shades.length || 0})` },
                { key: 'in_stock', label: `In Stock (> 0 kg)` },
                { key: 'pending', label: `Pending (Can Change)` },
                { key: '2ply', label: `2-PLY Only` },
                { key: '3ply', label: `3-PLY Only` },
              ].map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[
                    styles.tabItem,
                    filterTab === t.key && [styles.tabItemActive, { backgroundColor: colors.primary }],
                  ]}
                  onPress={() => setFilterTab(t.key as any)}
                >
                  <Text
                    style={[
                      styles.tabItemText,
                      filterTab === t.key && styles.tabItemTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* LOADING STATE */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingLabel, { color: colors.textSecondary }]}>
              Calculating consolidated stock in hand...
            </Text>
          </View>
        ) : filteredShades.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Stock Records Found</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {searchQuery ? `No shade matching "${searchQuery}"` : 'No inventory data found for the selected filter.'}
            </Text>
            <TouchableOpacity
              style={[styles.addFirstBtn, { backgroundColor: '#10B981' }]}
              onPress={() => openManualModal()}
            >
              <Text style={styles.addFirstBtnText}>➕ Enter Manual Opening Stock</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* SHADES INVENTORY LIST (NATURAL ASCENDING ORDER) */
          <View style={styles.shadesListContainer}>
            <View style={styles.listHeaderRow}>
              <Text style={[styles.listHeaderTitle, { color: colors.text }]}>
                Shade Inventory (Sorted Ascending: {filteredShades.length} Shades)
              </Text>
              <Text style={[styles.listHeaderNote, { color: colors.textSecondary }]}>
                *Pending tasks can be edited/changed until completed
              </Text>
            </View>

            {filteredShades.map((shade, idx) => {
              const isExpanded = !!expandedShades[shade.shade_number];
              const hasStock = shade.current_stock_total_kg > 0;
              const hasPending = shade.pending_batches > 0;

              return (
                <View
                  key={shade.shade_number}
                  style={[
                    styles.shadeCard,
                    { backgroundColor: colors.card, borderColor: hasStock ? '#10B98150' : colors.border },
                  ]}
                >
                  {/* CARD TOP BAR */}
                  <View style={styles.shadeCardHeader}>
                    <View style={styles.shadeBadgeGroup}>
                      <View style={[styles.shadeNumBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.shadeNumText}>#{shade.shade_number}</Text>
                      </View>
                      <View style={[styles.progBadge, { backgroundColor: colors.secondary + '20' }]}>
                        <Text style={[styles.progText, { color: colors.secondary }]}>
                          {shade.program_number} {shade.rc === 'Yes' ? '• RC' : ''}
                        </Text>
                      </View>
                      {hasPending && (
                        <View style={styles.pendingBadge}>
                          <Text style={styles.pendingBadgeText}>
                            ⏳ {shade.pending_batches} Batch In-Progress (Can Change)
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Stock Highlighting */}
                    <View style={styles.shadeTotalStockGroup}>
                      <Text style={[styles.stockValueTotal, { color: hasStock ? '#10B981' : colors.textSecondary }]}>
                        {shade.current_stock_total_kg.toFixed(1)} <Text style={styles.stockUnit}>KG</Text>
                      </Text>
                      <Text style={[styles.stockLabelTotal, { color: colors.textSecondary }]}>
                        Total Stock in Hand
                      </Text>
                    </View>
                  </View>

                  {/* 2-PLY & 3-PLY METRICS ROW */}
                  <View style={styles.plyMetricsRow}>
                    {/* 2-PLY Metric */}
                    <View style={[styles.plyMetricBox, { backgroundColor: '#1E3A8A15', borderColor: '#3B82F640' }]}>
                      <View style={styles.plyHeader}>
                        <Text style={[styles.plyTitle, { color: '#2563EB' }]}>🧶 2-PLY STOCK</Text>
                        <Text style={[styles.plySprings, { color: '#2563EB' }]}>
                          {shade.completed_springs_2ply} Springs
                        </Text>
                      </View>
                      <Text style={[styles.plyBigVal, { color: '#1D4ED8' }]}>
                        {shade.current_stock_2ply_kg.toFixed(1)} <Text style={styles.stockUnitSmall}>KG</Text>
                      </Text>
                      <View style={styles.plyBreakdownRow}>
                        <Text style={[styles.plyBreakdownText, { color: colors.textSecondary }]}>
                          Prod: {shade.completed_2ply_kg.toFixed(1)} kg
                        </Text>
                        {shade.manual_2ply_kg !== 0 && (
                          <Text style={[styles.plyBreakdownText, { color: shade.manual_2ply_kg > 0 ? '#10B981' : '#EF4444' }]}>
                            {shade.manual_2ply_kg > 0 ? `+${shade.manual_2ply_kg.toFixed(1)}` : shade.manual_2ply_kg.toFixed(1)} manual
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* 3-PLY Metric */}
                    <View style={[styles.plyMetricBox, { backgroundColor: '#581C8715', borderColor: '#A855F740' }]}>
                      <View style={styles.plyHeader}>
                        <Text style={[styles.plyTitle, { color: '#9333EA' }]}>🧵 3-PLY STOCK</Text>
                        <Text style={[styles.plySprings, { color: '#9333EA' }]}>
                          {shade.completed_springs_3ply} Springs
                        </Text>
                      </View>
                      <Text style={[styles.plyBigVal, { color: '#7E22CE' }]}>
                        {shade.current_stock_3ply_kg.toFixed(1)} <Text style={styles.stockUnitSmall}>KG</Text>
                      </Text>
                      <View style={styles.plyBreakdownRow}>
                        <Text style={[styles.plyBreakdownText, { color: colors.textSecondary }]}>
                          Prod: {shade.completed_3ply_kg.toFixed(1)} kg
                        </Text>
                        {shade.manual_3ply_kg !== 0 && (
                          <Text style={[styles.plyBreakdownText, { color: shade.manual_3ply_kg > 0 ? '#10B981' : '#EF4444' }]}>
                            {shade.manual_3ply_kg > 0 ? `+${shade.manual_3ply_kg.toFixed(1)}` : shade.manual_3ply_kg.toFixed(1)} manual
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* PENDING BATCHES SECTION (WITH CHANGE / EDIT OPTION) */}
                  {shade.pending_tasks.length > 0 && (
                    <View style={styles.pendingTasksSection}>
                      <Text style={styles.pendingSectionHeading}>
                        ⏳ In-Progress Lots (Change option available until marked completed):
                      </Text>
                      {shade.pending_tasks.map((pt, pIdx) => (
                        <View key={pt.task_id || pIdx} style={styles.pendingTaskCard}>
                          <View style={styles.pendingTaskInfo}>
                            <Text style={styles.pendingTaskMain}>
                              Machine: <Text style={styles.boldText}>{pt.machine}</Text> • Date:{' '}
                              <Text style={styles.boldText}>{pt.date}</Text>
                            </Text>
                            <Text style={styles.pendingTaskSub}>
                              2P Springs: <Text style={styles.boldText}>{pt.springs_2ply}</Text> • 3P Springs:{' '}
                              <Text style={styles.boldText}>{pt.springs_3ply}</Text> • Est Weight:{' '}
                              <Text style={styles.boldText}>{pt.weight.toFixed(1)} kg</Text>
                            </Text>
                            <Text style={styles.pendingStatusText}>Status: In-Progress / Pending</Text>
                          </View>

                          {/* ACTION BUTTON: CHANGE / EDIT OPTION */}
                          <TouchableOpacity
                            style={styles.changeTaskBtn}
                            onPress={() => openEditPendingTaskModal(pt)}
                          >
                            <Text style={styles.changeTaskBtnText}>✏️ Change / Edit Batch</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* BOTTOM ACTIONS BAR */}
                  <View style={styles.shadeCardFooter}>
                    <View style={styles.footerInfo}>
                      {shade.last_batch_date ? (
                        <Text style={[styles.lastBatchText, { color: colors.textSecondary }]}>
                          Last Batch: {shade.last_batch_date} ({shade.completed_batches} lots)
                        </Text>
                      ) : (
                        <Text style={[styles.lastBatchText, { color: colors.textSecondary }]}>
                          No completed batches yet
                        </Text>
                      )}
                    </View>

                    <View style={styles.footerBtns}>
                      <TouchableOpacity
                        style={[styles.adjustBtn, { backgroundColor: '#10B98120', borderColor: '#10B981' }]}
                        onPress={() => openManualModal(shade.shade_number)}
                      >
                        <Text style={[styles.adjustBtnText, { color: '#059669' }]}>
                          ➕ / ➖ Adjust Stock
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.expandBtn, { backgroundColor: colors.border + '60' }]}
                        onPress={() => toggleExpand(shade.shade_number)}
                      >
                        <Text style={[styles.expandBtnText, { color: colors.text }]}>
                          {isExpanded ? '▲ Hide History' : '▼ View Adjustments'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* EXPANDED ADJUSTMENT HISTORY */}
                  {isExpanded && (
                    <View style={[styles.expandedDrawer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Text style={[styles.drawerTitle, { color: colors.text }]}>
                        Manual Stock Adjustment Log for Shade #{shade.shade_number}
                      </Text>
                      {shade.manual_entries.length === 0 ? (
                        <Text style={[styles.noEntriesText, { color: colors.textSecondary }]}>
                          No manual adjustments recorded for this shade.
                        </Text>
                      ) : (
                        shade.manual_entries.map((entry) => (
                          <View key={entry.id} style={[styles.entryRow, { borderBottomColor: colors.border }]}>
                            <View style={styles.entryInfo}>
                              <Text style={[styles.entryDate, { color: colors.text }]}>
                                {entry.date} • <Text style={styles.boldText}>{entry.total_kg > 0 ? `+${entry.total_kg}` : entry.total_kg} kg</Text>
                              </Text>
                              <Text style={[styles.entrySub, { color: colors.textSecondary }]}>
                                2-PLY: {entry.ply2_kg} kg | 3-PLY: {entry.ply3_kg} kg • Reason: "{entry.notes}"
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={styles.deleteEntryBtn}
                              onPress={() => handleDeleteManualEntry(entry.id)}
                            >
                              <Text style={styles.deleteEntryText}>🗑 Delete</Text>
                            </TouchableOpacity>
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* MODAL 1: MANUAL STOCK ENTRY */}
      <Modal
        visible={manualModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setManualModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>➕ Enter Manual Current Stock</Text>
              <TouchableOpacity onPress={() => setManualModalVisible(false)}>
                <Text style={styles.closeModalText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Opening physical stock enter karein ya inventory adjustment (addition/dispatch) karein.
            </Text>

            {/* Shade Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Shade Number *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. 219"
                placeholderTextColor={colors.textSecondary}
                value={manualShade}
                onChangeText={setManualShade}
              />
            </View>

            {/* 2-PLY and 3-PLY Weights */}
            <View style={styles.inputsRow}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>2-PLY (KG)</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                  placeholder="0.0"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  value={manualPly2}
                  onChangeText={setManualPly2}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>3-PLY (KG)</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                  placeholder="0.0"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  value={manualPly3}
                  onChangeText={setManualPly3}
                />
              </View>
            </View>

            {/* Date */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textSecondary}
                value={manualDate}
                onChangeText={setManualDate}
              />
            </View>

            {/* Notes */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Notes / Reason</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. Opening physical stock, godown verification"
                placeholderTextColor={colors.textSecondary}
                value={manualNotes}
                onChangeText={setManualNotes}
              />
            </View>

            {/* Modal Actions */}
            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setManualModalVisible(false)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: '#10B981' }]}
                onPress={handleSaveManualStock}
                disabled={submittingManual}
              >
                {submittingManual ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Save Stock Entry</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: MODIFY PENDING TASK BATCH (AVAILABLE UNTIL COMPLETED) */}
      <Modal
        visible={editTaskModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditTaskModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>✏️ Change / Modify Pending Lot</Text>
              <TouchableOpacity onPress={() => setEditTaskModalVisible(false)}>
                <Text style={styles.closeModalText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.lockNoticeBox}>
              <Text style={styles.lockNoticeText}>
                ⚠️ Rule: Change option is available jab tak ki task complete nahi ho jaata. Ek baar complete mark hone ke baad details locked ho jayengi.
              </Text>
            </View>

            {editingTask && (
              <Text style={[styles.modalTaskDetails, { color: colors.textSecondary }]}>
                Machine: {editingTask.machine} • Date: {editingTask.date}
              </Text>
            )}

            {/* Shade Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Shade Number</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                value={taskShadeNumber}
                onChangeText={setTaskShadeNumber}
              />
            </View>

            {/* Springs 2P & 3P */}
            <View style={styles.inputsRow}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>2-PLY Springs</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                  keyboardType="numeric"
                  value={taskSprings2Ply}
                  onChangeText={setTaskSprings2Ply}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>3-PLY Springs</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                  keyboardType="numeric"
                  value={taskSprings3Ply}
                  onChangeText={setTaskSprings3Ply}
                />
              </View>
            </View>

            {/* Weights */}
            <View style={styles.inputsRow}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>2-PLY Weight (kg)</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                  placeholder="Optional"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  value={taskPly2Weight}
                  onChangeText={setTaskPly2Weight}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>3-PLY Weight (kg)</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                  placeholder="Optional"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  value={taskPly3Weight}
                  onChangeText={setTaskPly3Weight}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Total Weight (kg)</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                placeholder="Lot weight"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={taskTotalWeight}
                onChangeText={setTaskTotalWeight}
              />
            </View>

            {/* Modal Actions */}
            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setEditTaskModalVisible(false)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: '#F59E0B' }]}
                onPress={handleSaveModifiedTask}
                disabled={savingTask}
              >
                {savingTask ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Update Pending Lot</Text>
                )}
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    flexWrap: 'wrap',
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  backButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#E5E7EB',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginVertical: 4,
  },
  kpiUnit: {
    fontSize: 15,
    fontWeight: '600',
    color: '#D1D5DB',
  },
  kpiSub: {
    fontSize: 12,
    color: '#F3F4F6',
    opacity: 0.9,
  },
  controlsCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  filterSection: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  filterButtonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterToggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#E5E7EB30',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterToggleBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  filterToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  filterToggleTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  dateInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 13,
  },
  applyDateBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  applyDateText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  searchAndTabsRow: {
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  clearSearchText: {
    fontSize: 16,
    color: '#9CA3AF',
    paddingHorizontal: 6,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tabItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#9CA3AF20',
  },
  tabItemActive: {
    backgroundColor: '#2563EB',
  },
  tabItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  tabItemTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  centerContainer: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLabel: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyCard: {
    padding: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  addFirstBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addFirstBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  shadesListContainer: {
    gap: 14,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  listHeaderTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  listHeaderNote: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  shadeCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  shadeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  shadeBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  shadeNumBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  shadeNumText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  progBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  progText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pendingBadgeText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
  },
  shadeTotalStockGroup: {
    alignItems: 'flex-end',
  },
  stockValueTotal: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  stockUnit: {
    fontSize: 13,
    fontWeight: '600',
  },
  stockLabelTotal: {
    fontSize: 11,
    fontWeight: '600',
  },
  plyMetricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  plyMetricBox: {
    flex: 1,
    minWidth: 140,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  plyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  plyTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  plySprings: {
    fontSize: 10,
    fontWeight: '700',
  },
  plyBigVal: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  stockUnitSmall: {
    fontSize: 11,
    fontWeight: '500',
  },
  plyBreakdownRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 3,
  },
  plyBreakdownText: {
    fontSize: 10,
    fontWeight: '500',
  },
  pendingTasksSection: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  pendingSectionHeading: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 6,
  },
  pendingTaskCard: {
    backgroundColor: '#fff',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    flexWrap: 'wrap',
    gap: 8,
  },
  pendingTaskInfo: {
    flex: 1,
    minWidth: 180,
  },
  pendingTaskMain: {
    fontSize: 12,
    color: '#1F2937',
  },
  pendingTaskSub: {
    fontSize: 11,
    color: '#4B5563',
    marginTop: 2,
  },
  pendingStatusText: {
    fontSize: 10,
    color: '#D97706',
    fontWeight: '700',
    marginTop: 2,
  },
  boldText: {
    fontWeight: 'bold',
  },
  changeTaskBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  changeTaskBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  shadeCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB50',
    flexWrap: 'wrap',
    gap: 8,
  },
  footerInfo: {},
  lastBatchText: {
    fontSize: 11,
  },
  footerBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  adjustBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  adjustBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  expandBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  expandBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  expandedDrawer: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  drawerTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  noEntriesText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  entryInfo: {
    flex: 1,
  },
  entryDate: {
    fontSize: 12,
  },
  entrySub: {
    fontSize: 10,
    marginTop: 2,
  },
  deleteEntryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#EF444420',
    borderRadius: 4,
  },
  deleteEntryText: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '700',
  },
  // MODALS
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeModalText: {
    fontSize: 20,
    color: '#9CA3AF',
    fontWeight: 'bold',
  },
  modalSubtitle: {
    fontSize: 12,
    marginBottom: 14,
  },
  modalTaskDetails: {
    fontSize: 12,
    marginBottom: 12,
    fontWeight: '600',
  },
  lockNoticeBox: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  lockNoticeText: {
    color: '#92400E',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 5,
  },
  formInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  inputsRow: {
    flexDirection: 'row',
  },
  modalActionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontWeight: '600',
    fontSize: 13,
  },
  submitBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
