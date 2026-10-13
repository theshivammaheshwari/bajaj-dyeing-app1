import React, { useState, useEffect, useRef } from 'react';
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
  display_number?: string;
  shade_id: string | null;
  program_number: string;
  rc: string;
  // Springs metrics (Primary for factory floor)
  springs_2ply: number;
  springs_3ply: number;
  total_springs: number;
  is_spring_custom?: boolean;
  completed_springs_2ply: number;
  completed_springs_3ply: number;
  // Weight metrics
  completed_2ply_kg: number;
  completed_3ply_kg: number;
  completed_total_kg: number;
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
    total_springs: number;
    total_springs_2ply: number;
    total_springs_3ply: number;
    total_stock_kg: number;
    total_2ply_kg: number;
    total_3ply_kg: number;
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
  const [filterTab, setFilterTab] = useState<'all' | 'in_stock' | '2ply' | '3ply' | 'pending'>('all');

  // Keyboard navigation & fast edit state
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(0);
  const [selectedPly, setSelectedPly] = useState<'2ply' | '3ply'>('2ply');
  const [updatingShade, setUpdatingShade] = useState<string | null>(null);
  const [showKeysGuide, setShowKeysGuide] = useState(false);

  // Print Modal Options
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printPlyOption, setPrintPlyOption] = useState<'both' | '2ply' | '3ply'>('both');
  const [printScope, setPrintScope] = useState<'all_sequence' | 'in_stock_only'>('all_sequence');

  // Manual Stock Modal State
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualShade, setManualShade] = useState('');
  const [manualSprings2, setManualSprings2] = useState('');
  const [manualSprings3, setManualSprings3] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);

  // Edit Pending Task Modal State
  const [editTaskModalVisible, setEditTaskModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<PendingTaskItem | null>(null);
  const [taskShadeNumber, setTaskShadeNumber] = useState('');
  const [taskSprings2Ply, setTaskSprings2Ply] = useState('');
  const [taskSprings3Ply, setTaskSprings3Ply] = useState('');
  const [taskTotalWeight, setTaskTotalWeight] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  const searchInputRef = useRef<TextInput | null>(null);
  const rowRefs = useRef<{ [key: number]: any }>({});

  useEffect(() => {
    fetchStockData();
  }, []);

  const fetchStockData = async () => {
    try {
      setLoading(true);
      const url = `${EXPO_PUBLIC_BACKEND_URL}/api/stock-in-hand`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setStockData(data);
      } else {
        const errJson = await response.json().catch(() => null);
        const errMsg = errJson?.detail || `Server error (${response.status})`;
        showAlert('Error', errMsg);
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

  // Filtered Shades List in Natural Sequence
  const filteredShades: ShadeStockItem[] = (stockData?.shades || []).filter(item => {
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase().replace('#', '');
      const sn = item.shade_number.toLowerCase();
      const dn = (item.display_number || '').toLowerCase();
      if (!sn.includes(q) && !dn.includes(q)) return false;
    }
    if (filterTab === 'in_stock') return item.total_springs > 0;
    if (filterTab === '2ply') return item.springs_2ply > 0;
    if (filterTab === '3ply') return item.springs_3ply > 0;
    if (filterTab === 'pending') return item.pending_batches > 0;
    return true;
  });

  // Clamp selectedRowIndex within bounds
  useEffect(() => {
    if (filteredShades.length > 0 && selectedRowIndex >= filteredShades.length) {
      setSelectedRowIndex(filteredShades.length - 1);
    }
  }, [filteredShades.length]);

  // Adjust Spring Quantity (+1 / -1 / set)
  const adjustSpringQuantity = async (
    shadeNumber: string,
    plyType: '2ply' | '3ply',
    action: 'increment' | 'decrement' | 'set',
    value?: number
  ) => {
    if (!stockData) return;

    // Optimistic UI Update for instant tactile feedback
    const oldShades = [...stockData.shades];
    const targetIdx = oldShades.findIndex(s => s.shade_number === shadeNumber);
    if (targetIdx === -1) return;

    const currentShade = { ...oldShades[targetIdx] };
    let new2p = currentShade.springs_2ply;
    let new3p = currentShade.springs_3ply;

    if (action === 'increment') {
      if (plyType === '2ply') new2p += 1;
      else new3p += 1;
    } else if (action === 'decrement') {
      if (plyType === '2ply') new2p = Math.max(0, new2p - 1);
      else new3p = Math.max(0, new3p - 1);
    } else if (action === 'set' && value !== undefined) {
      if (plyType === '2ply') new2p = Math.max(0, value);
      else new3p = Math.max(0, value);
    }

    currentShade.springs_2ply = new2p;
    currentShade.springs_3ply = new3p;
    currentShade.total_springs = new2p + new3p;
    oldShades[targetIdx] = currentShade;

    // Recalculate summary totals optimistically
    const newTotalSprings = oldShades.reduce((sum, s) => sum + s.total_springs, 0);
    const newSprings2 = oldShades.reduce((sum, s) => sum + s.springs_2ply, 0);
    const newSprings3 = oldShades.reduce((sum, s) => sum + s.springs_3ply, 0);

    setStockData({
      ...stockData,
      summary: {
        ...stockData.summary,
        total_springs: newTotalSprings,
        total_springs_2ply: newSprings2,
        total_springs_3ply: newSprings3,
        in_stock_shades_count: oldShades.filter(s => s.total_springs > 0).length,
      },
      shades: oldShades,
    });

    setUpdatingShade(shadeNumber);

    // Call Backend API
    try {
      const payload = {
        shade_number: shadeNumber,
        ply_type: plyType,
        action: action,
        delta: 1,
        value: action === 'set' ? value : undefined,
      };

      const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/stock-in-hand/adjust-springs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error('Failed to sync springs with backend');
      }
    } catch (err) {
      console.error('Network error during spring adjustment:', err);
    } finally {
      setUpdatingShade(null);
    }
  };

  // Safe Back / Escape navigation to dashboard
  const handleBack = () => {
    try {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    } catch {
      router.replace('/');
    }
  };

  // Keyboard navigation handler ("All working from keys only")
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      // ESCAPE KEY: Close modal if open, blur input if typing, or navigate back to dashboard
      if (e.key === 'Escape') {
        e.preventDefault();
        if (printModalVisible) {
          setPrintModalVisible(false);
          return;
        }
        if (manualModalVisible) {
          setManualModalVisible(false);
          return;
        }
        if (editTaskModalVisible) {
          setEditTaskModalVisible(false);
          return;
        }
        if (showKeysGuide) {
          setShowKeysGuide(false);
          return;
        }
        if (isInput) {
          (activeEl as HTMLElement).blur();
          return;
        }
        handleBack();
        return;
      }

      if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setPrintModalVisible(true);
        return;
      }

      if (filteredShades.length === 0) return;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setSelectedRowIndex(prev => {
          const next = Math.min(filteredShades.length - 1, prev + 1);
          return next;
        });
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setSelectedRowIndex(prev => {
          const next = Math.max(0, prev - 1);
          return next;
        });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedPly('2ply');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedPly('3ply');
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const activeShade = filteredShades[selectedRowIndex];
        if (activeShade) {
          adjustSpringQuantity(activeShade.shade_number, selectedPly, 'increment');
        }
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        const activeShade = filteredShades[selectedRowIndex];
        if (activeShade) {
          adjustSpringQuantity(activeShade.shade_number, selectedPly, 'decrement');
        }
      } else if (e.key === 'Enter') {
        // Move to next shade on Enter
        e.preventDefault();
        setSelectedRowIndex(prev => Math.min(filteredShades.length - 1, prev + 1));
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setPrintModalVisible(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [filteredShades, selectedRowIndex, selectedPly, stockData]);

  // Auto-scroll webpage so active row stays smoothly centered and visible when navigating with Arrow keys
  useEffect(() => {
    if (Platform.OS === 'web') {
      const timer = setTimeout(() => {
        const el = document.getElementById(`stock-row-${selectedRowIndex}`);
        if (el) {
          el.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest',
          });
        }
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [selectedRowIndex]);

  // Handle Quick Manual Direct Set
  const openManualDirectModal = (prefillShade = '', initial2p = 0, initial3p = 0) => {
    setManualShade(prefillShade);
    setManualSprings2(initial2p ? initial2p.toString() : '');
    setManualSprings3(initial3p ? initial3p.toString() : '');
    setManualModalVisible(true);
  };

  const handleSaveDirectSprings = async () => {
    if (!manualShade.trim()) {
      showAlert('Missing Shade', 'Please enter a shade number');
      return;
    }
    const s2 = parseInt(manualSprings2 || '0', 10);
    const s3 = parseInt(manualSprings3 || '0', 10);

    try {
      setSubmittingManual(true);
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/stock-in-hand/adjust-springs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shade_number: manualShade.trim(),
          springs_2ply: s2,
          springs_3ply: s3,
          action: 'set',
        }),
      });

      if (res.ok) {
        setManualModalVisible(false);
        showAlert('Success', `Updated springs for Shade #${manualShade}`);
        fetchStockData();
      } else {
        const err = await res.json();
        showAlert('Error', err.detail || 'Failed to save springs');
      }
    } catch (error) {
      showAlert('Error', 'Network error');
    } finally {
      setSubmittingManual(false);
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

  // 1-PAGE PRINT SHEET GENERATOR (MATCHING REFERENCE IMAGE "SPRING QTY LIST — 001 TO 050")
  const executeOnePagePrint = () => {
    if (Platform.OS !== 'web') {
      showAlert('Print Sheet', 'Please open the web portal to print this 1-page sheet.');
      return;
    }

    setPrintModalVisible(false);

    // Prepare shades for print
    let printList = (stockData?.shades || []).slice();

    if (printScope === 'in_stock_only') {
      if (printPlyOption === '2ply') {
        printList = printList.filter(s => s.springs_2ply > 0);
      } else if (printPlyOption === '3ply') {
        printList = printList.filter(s => s.springs_3ply > 0);
      } else {
        printList = printList.filter(s => s.total_springs > 0);
      }
    }

    // Determine header title range
    const firstNum = printList.length > 0 ? (printList[0].display_number || printList[0].shade_number) : '001';
    const lastNum = printList.length > 0 ? (printList[printList.length - 1].display_number || printList[printList.length - 1].shade_number) : '050';
    const sheetTitle = `SPRING QTY LIST — ${firstNum} TO ${lastNum}`;

    // Split into 2 or 3 side-by-side columns to fit strictly on ONE single A4 page
    const totalItems = printList.length;
    const numColumns = totalItems > 60 ? 3 : 2;
    const rowsPerCol = Math.ceil(totalItems / numColumns);

    const columnsData: ShadeStockItem[][] = [];
    for (let c = 0; c < numColumns; c++) {
      const start = c * rowsPerCol;
      const end = start + rowsPerCol;
      columnsData.push(printList.slice(start, end));
    }

    // Totals for sheet
    const total2p = printList.reduce((acc, s) => acc + s.springs_2ply, 0);
    const total3p = printList.reduce((acc, s) => acc + s.springs_3ply, 0);
    const grandTotal = total2p + total3p;

    const plySubtitle =
      printPlyOption === '2ply'
        ? `Option: 2-PLY Only (Total: ${total2p} Springs)`
        : printPlyOption === '3ply'
        ? `Option: 3-PLY Only (Total: ${total3p} Springs)`
        : `Option: Both 2-PLY & 3-PLY (2-PLY: ${total2p} | 3-PLY: ${total3p} | Total: ${grandTotal} Springs)`;

    // Render table HTML per column
    const renderColumnTable = (items: ShadeStockItem[]) => {
      return `
        <table class="spring-table">
          <thead>
            <tr>
              <th class="th-num">NUMBER</th>
              ${
                printPlyOption === 'both'
                  ? `<th class="th-qty">2-PLY</th><th class="th-qty">3-PLY</th><th class="th-qty">TOTAL</th>`
                  : `<th class="th-qty">SPRING QTY</th>`
              }
            </tr>
          </thead>
          <tbody>
            ${items
              .map(item => {
                const num = item.display_number || item.shade_number;
                if (printPlyOption === '2ply') {
                  const val = item.springs_2ply > 0 ? `<strong>${item.springs_2ply}</strong>` : `<span class="blank-line">______</span>`;
                  return `<tr><td class="td-num">${num}</td><td class="td-qty">${val}</td></tr>`;
                } else if (printPlyOption === '3ply') {
                  const val = item.springs_3ply > 0 ? `<strong>${item.springs_3ply}</strong>` : `<span class="blank-line">______</span>`;
                  return `<tr><td class="td-num">${num}</td><td class="td-qty">${val}</td></tr>`;
                } else {
                  const v2 = item.springs_2ply > 0 ? item.springs_2ply : '-';
                  const v3 = item.springs_3ply > 0 ? item.springs_3ply : '-';
                  const tot = item.total_springs > 0 ? `<strong>${item.total_springs}</strong>` : `<span class="blank-line">___</span>`;
                  return `<tr><td class="td-num">${num}</td><td class="td-qty">${v2}</td><td class="td-qty">${v3}</td><td class="td-qty bold-tot">${tot}</td></tr>`;
                }
              })
              .join('')}
          </tbody>
        </table>
      `;
    };

    const printHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${sheetTitle}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm 6mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      margin: 0;
      padding: 0;
      color: #000;
      background: #fff;
    }
    .header-box {
      text-align: center;
      margin-bottom: 10px;
    }
    .title-main {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: 1.5px;
      margin: 0 0 4px 0;
      text-transform: uppercase;
    }
    .subtitle-row {
      font-size: 11px;
      font-weight: 700;
      color: #222;
      display: flex;
      justify-content: space-between;
      border-bottom: 1.5px solid #000;
      padding-bottom: 4px;
      margin-bottom: 8px;
    }
    .sheet-grid {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      width: 100%;
    }
    .sheet-col {
      flex: 1;
    }
    .spring-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11.5px;
    }
    .spring-table th {
      background-color: #e5e7eb !important;
      border: 1.5px solid #000;
      padding: 4px 6px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-align: center;
      font-size: 11px;
    }
    .spring-table td {
      border: 1.2px solid #000;
      padding: 3.5px 6px;
      text-align: center;
      height: 21px;
      font-size: 12px;
    }
    .td-num {
      font-weight: 800;
      background: #fafafa;
      width: 45%;
    }
    .td-qty {
      font-size: 12px;
    }
    .bold-tot {
      background: #f3f4f6;
    }
    .blank-line {
      color: #777;
      letter-spacing: 1px;
    }
    .footer-note {
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 700;
      border-top: 1px solid #333;
      padding-top: 4px;
    }
  </style>
</head>
<body>
  <div class="header-box">
    <h1 class="title-main">${sheetTitle}</h1>
    <div class="subtitle-row">
      <span>${plySubtitle}</span>
      <span>Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
    </div>
  </div>

  <div class="sheet-grid">
    ${columnsData.map(colItems => `<div class="sheet-col">${renderColumnTable(colItems)}</div>`).join('')}
  </div>

  <div class="footer-note">
    <span>Bajaj Dyeing & Finishing • Physical Spring Count Sheet</span>
    <span>Total Available Stock: <strong>${grandTotal} Springs</strong> across <strong>${printList.filter(s => s.total_springs > 0).length}</strong> shades</span>
  </div>
</body>
</html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 400);
    }
  };

  const grandSummary = stockData?.summary;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />

      {/* TOP HEADER */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.secondary + '20' }]}
            onPress={handleBack}
          >
            <Text style={[styles.backButtonText, { color: colors.secondary }]}>← Esc</Text>
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>📦 Stock in Hand (Springs)</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              Factory Floor Sequence • 2-PLY & 3-PLY Spring Counts
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]}
            onPress={() => setShowKeysGuide(prev => !prev)}
          >
            <Text style={styles.actionBtnText}>⌨️ Keys Guide</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
            onPress={() => openManualDirectModal()}
          >
            <Text style={styles.actionBtnText}>➕ Manual Entry</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#2B6CB0' }]}
            onPress={() => setPrintModalVisible(true)}
          >
            <Text style={styles.actionBtnText}>🖨️ 1-Page Print</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* KPI CARDS (FOCUSED ON SPRINGS - ZERO KG CONFUSION) */}
        {grandSummary && (
          <View style={styles.kpiRow}>
            {/* Total Springs In Hand */}
            <View style={[styles.kpiCard, { backgroundColor: '#064E3B', borderColor: '#10B981' }]}>
              <Text style={styles.kpiLabel}>TOTAL SPRINGS IN HAND</Text>
              <Text style={styles.kpiValue}>
                {grandSummary.total_springs}{' '}
                <Text style={styles.kpiUnit}>SPRINGS</Text>
              </Text>
              <Text style={styles.kpiSub}>
                {grandSummary.in_stock_shades_count} / {grandSummary.total_shades_count} Shades Available
              </Text>
            </View>

            {/* 2-PLY Springs */}
            <View style={[styles.kpiCard, { backgroundColor: '#1E3A8A', borderColor: '#3B82F6' }]}>
              <Text style={styles.kpiLabel}>2-PLY SPRINGS READY</Text>
              <Text style={styles.kpiValue}>
                {grandSummary.total_springs_2ply}{' '}
                <Text style={styles.kpiUnit}>SPRINGS</Text>
              </Text>
              <Text style={styles.kpiSub}>Active for 2-PLY Dispatch</Text>
            </View>

            {/* 3-PLY Springs */}
            <View style={[styles.kpiCard, { backgroundColor: '#581C87', borderColor: '#A855F7' }]}>
              <Text style={styles.kpiLabel}>3-PLY SPRINGS READY</Text>
              <Text style={styles.kpiValue}>
                {grandSummary.total_springs_3ply}{' '}
                <Text style={styles.kpiUnit}>SPRINGS</Text>
              </Text>
              <Text style={styles.kpiSub}>Active for 3-PLY Dispatch</Text>
            </View>

            {/* In-Progress Batches */}
            <View style={[styles.kpiCard, { backgroundColor: '#78350F', borderColor: '#F59E0B' }]}>
              <Text style={styles.kpiLabel}>IN-PROGRESS LOTS</Text>
              <Text style={styles.kpiValue}>
                {grandSummary.total_pending_batches}{' '}
                <Text style={styles.kpiUnit}>LOTS</Text>
              </Text>
              <Text style={styles.kpiSub}>Change Option Available</Text>
            </View>
          </View>
        )}

        {/* KEYBOARD SHORTCUT HELPER BANNER */}
        <View style={[styles.keyboardNoticeBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
          <View style={styles.keyboardNoticeHeader}>
            <Text style={styles.keyboardNoticeTitle}>
              ⚡ 100% Keyboard Mode: Mouse ke saath Keyboard se superfast kaam karein!
            </Text>
            <TouchableOpacity onPress={() => setShowKeysGuide(prev => !prev)}>
              <Text style={styles.toggleGuideText}>{showKeysGuide ? 'Hide Details ▲' : 'View Keys ▼'}</Text>
            </TouchableOpacity>
          </View>
          {showKeysGuide && (
            <View style={styles.keysListGrid}>
              <Text style={styles.keyItem}>
                <Text style={styles.keyBadge}>↑ / ↓ or Enter</Text> Move up/down between shade numbers
              </Text>
              <Text style={styles.keyItem}>
                <Text style={styles.keyBadge}>← / →</Text> Switch active focus between 2-PLY and 3-PLY
              </Text>
              <Text style={styles.keyItem}>
                <Text style={styles.keyBadge}>+ / =</Text> Quick +1 spring quantity directly
              </Text>
              <Text style={styles.keyItem}>
                <Text style={styles.keyBadge}>- / _</Text> Quick -1 spring quantity directly
              </Text>
              <Text style={styles.keyItem}>
                <Text style={styles.keyBadge}>/</Text> Focus search box instantly
              </Text>
              <Text style={styles.keyItem}>
                <Text style={styles.keyBadge}>P or Ctrl+P</Text> Open 1-Page Print Sheet dialog
              </Text>
              <Text style={styles.keyItem}>
                <Text style={styles.keyBadge}>Esc</Text> Go back to Dashboard / Close
              </Text>
            </View>
          )}
        </View>

        {/* CONTROLS: SEARCH & TABS */}
        <View style={[styles.controlsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.searchAndTabsRow}>
            {/* Search Box */}
            <View style={[styles.searchBox, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                ref={searchInputRef}
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search Shade (e.g. 001, 120, 219) - press '/' to search..."
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

            {/* Filter Tabs */}
            <View style={styles.tabRow}>
              {[
                { key: 'all', label: `All Sequence (${stockData?.shades.length || 0})` },
                { key: 'in_stock', label: `In Stock (> 0)` },
                { key: '2ply', label: `2-PLY Stock` },
                { key: '3ply', label: `3-PLY Stock` },
                { key: 'pending', label: `Pending Batches (${grandSummary?.total_pending_batches || 0})` },
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
              Loading spring inventory in sequence...
            </Text>
          </View>
        ) : filteredShades.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Stock Records Found</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {searchQuery ? `No shade matching "${searchQuery}"` : 'No inventory data found for this filter.'}
            </Text>
            <TouchableOpacity
              style={[styles.addFirstBtn, { backgroundColor: '#10B981' }]}
              onPress={() => openManualDirectModal()}
            >
              <Text style={styles.addFirstBtnText}>➕ Enter Opening Stock</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* SEQUENCE TABLE (MATCHING CLIENT'S "SPRING QTY LIST" SHEET) */
          <View style={[styles.tableContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* TABLE HEADER */}
            <View style={styles.tableHeaderRow}>
              <View style={[styles.thCol, styles.colNum]}>
                <Text style={styles.thText}>NUMBER</Text>
              </View>
              <View style={[styles.thCol, styles.colPly]}>
                <Text style={[styles.thText, { color: '#1D4ED8' }]}>2-PLY SPRINGS (+ / -)</Text>
              </View>
              <View style={[styles.thCol, styles.colPly]}>
                <Text style={[styles.thText, { color: '#7E22CE' }]}>3-PLY SPRINGS (+ / -)</Text>
              </View>
              <View style={[styles.thCol, styles.colTotal]}>
                <Text style={styles.thText}>TOTAL SPRINGS</Text>
              </View>
              <View style={[styles.thCol, styles.colActions]}>
                <Text style={styles.thText}>STATUS & ACTIONS</Text>
              </View>
            </View>

            {/* TABLE ROWS */}
            {filteredShades.map((shade, idx) => {
              const isSelectedRow = selectedRowIndex === idx;
              const hasStock = shade.total_springs > 0;
              const hasPending = shade.pending_batches > 0;
              const displayNum = shade.display_number || shade.shade_number;

              return (
                <View
                  key={shade.shade_number}
                  nativeID={`stock-row-${idx}`}
                  {...({ id: `stock-row-${idx}` } as any)}
                  ref={el => {
                    rowRefs.current[idx] = el;
                  }}
                  style={[
                    styles.tableRow,
                    { borderBottomColor: colors.border },
                    isSelectedRow && styles.tableRowSelected,
                    hasStock && !isSelectedRow && styles.tableRowHasStock,
                  ]}
                >
                  {/* NUMBER COLUMN (001, 002, 003...) */}
                  <TouchableOpacity
                    style={[styles.tdCol, styles.colNum]}
                    onPress={() => setSelectedRowIndex(idx)}
                  >
                    <View style={[styles.numberBadge, isSelectedRow && styles.numberBadgeSelected]}>
                      <Text style={[styles.numberText, isSelectedRow && styles.numberTextSelected]}>
                        {isSelectedRow ? `👉 ${displayNum}` : displayNum}
                      </Text>
                    </View>
                    <Text style={[styles.subProgramText, { color: isSelectedRow ? '#1E40AF' : colors.textSecondary }]}>
                      {shade.program_number}
                    </Text>
                  </TouchableOpacity>

                  {/* 2-PLY SPRINGS COLUMN WITH (+ -) BUTTONS */}
                  <View
                    style={[
                      styles.tdCol,
                      styles.colPly,
                      isSelectedRow && selectedPly === '2ply' && styles.activeCellHighlight,
                    ]}
                  >
                    <TouchableOpacity
                      style={[styles.stepperBtn, styles.btnMinus]}
                      onPress={() => adjustSpringQuantity(shade.shade_number, '2ply', 'decrement')}
                    >
                      <Text style={styles.stepperBtnText}>−</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.qtyDisplayBox}
                      onPress={() => {
                        setSelectedRowIndex(idx);
                        setSelectedPly('2ply');
                        openManualDirectModal(shade.shade_number, shade.springs_2ply, shade.springs_3ply);
                      }}
                    >
                      <Text style={[styles.qtyNumberText, { color: '#1E40AF' }]}>
                        {shade.springs_2ply}
                      </Text>
                      <Text style={styles.qtyUnitLabel}>spr</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.stepperBtn, styles.btnPlus]}
                      onPress={() => adjustSpringQuantity(shade.shade_number, '2ply', 'increment')}
                    >
                      <Text style={styles.stepperBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 3-PLY SPRINGS COLUMN WITH (+ -) BUTTONS */}
                  <View
                    style={[
                      styles.tdCol,
                      styles.colPly,
                      isSelectedRow && selectedPly === '3ply' && styles.activeCellHighlight,
                    ]}
                  >
                    <TouchableOpacity
                      style={[styles.stepperBtn, styles.btnMinus]}
                      onPress={() => adjustSpringQuantity(shade.shade_number, '3ply', 'decrement')}
                    >
                      <Text style={styles.stepperBtnText}>−</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.qtyDisplayBox}
                      onPress={() => {
                        setSelectedRowIndex(idx);
                        setSelectedPly('3ply');
                        openManualDirectModal(shade.shade_number, shade.springs_2ply, shade.springs_3ply);
                      }}
                    >
                      <Text style={[styles.qtyNumberText, { color: '#6B21A8' }]}>
                        {shade.springs_3ply}
                      </Text>
                      <Text style={styles.qtyUnitLabel}>spr</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.stepperBtn, styles.btnPlus]}
                      onPress={() => adjustSpringQuantity(shade.shade_number, '3ply', 'increment')}
                    >
                      <Text style={styles.stepperBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  {/* TOTAL SPRINGS COLUMN */}
                  <View style={[styles.tdCol, styles.colTotal]}>
                    <View style={[styles.totalSpringsBadge, hasStock ? styles.badgeActive : styles.badgeZero]}>
                      <Text style={[styles.totalSpringsText, hasStock ? styles.textActive : styles.textZero]}>
                        {shade.total_springs}
                      </Text>
                    </View>
                  </View>

                  {/* ACTIONS / IN-PROGRESS CHANGE BUTTON */}
                  <View style={[styles.tdCol, styles.colActions]}>
                    {hasPending ? (
                      <TouchableOpacity
                        style={styles.changeLotBtn}
                        onPress={() => {
                          if (shade.pending_tasks.length > 0) {
                            openEditPendingTaskModal(shade.pending_tasks[0]);
                          }
                        }}
                      >
                        <Text style={styles.changeLotBtnText}>
                          ⏳ {shade.pending_batches} Lot (Change)
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.editValuesBtn}
                        onPress={() => openManualDirectModal(shade.shade_number, shade.springs_2ply, shade.springs_3ply)}
                      >
                        <Text style={styles.editValuesBtnText}>✏️ Set Qty</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* FLOATING STICKY ACTIVE ROW INDICATOR (Always visible so user knows current active shade number) */}
      {filteredShades.length > 0 && filteredShades[selectedRowIndex] && (
        <View style={[styles.floatingActiveBar, { backgroundColor: colors.card, borderColor: '#2563EB' }]}>
          <View style={styles.floatingLeft}>
            <View style={styles.floatingActiveTag}>
              <Text style={styles.floatingActiveTagText}>ACTIVE</Text>
            </View>
            <Text style={[styles.floatingShadeNum, { color: colors.text }]}>
              #{filteredShades[selectedRowIndex].display_number || filteredShades[selectedRowIndex].shade_number}
            </Text>
            <Text style={[styles.floatingRowIdx, { color: colors.textSecondary }]}>
              ({selectedRowIndex + 1}/{filteredShades.length})
            </Text>
          </View>

          <View style={styles.floatingCenter}>
            <TouchableOpacity
              style={[
                styles.floatingPlyToggle,
                selectedPly === '2ply' && styles.floatingPlyToggleActive2P,
              ]}
              onPress={() => setSelectedPly('2ply')}
            >
              <Text style={[styles.floatingPlyToggleText, selectedPly === '2ply' && styles.floatingPlyToggleTextActive]}>
                2-PLY: {filteredShades[selectedRowIndex].springs_2ply} spr
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.floatingPlyToggle,
                selectedPly === '3ply' && styles.floatingPlyToggleActive3P,
              ]}
              onPress={() => setSelectedPly('3ply')}
            >
              <Text style={[styles.floatingPlyToggleText, selectedPly === '3ply' && styles.floatingPlyToggleTextActive]}>
                3-PLY: {filteredShades[selectedRowIndex].springs_3ply} spr
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.floatingRight}>
            <TouchableOpacity
              style={[styles.floatingActionBtn, styles.btnMinus]}
              onPress={() => adjustSpringQuantity(filteredShades[selectedRowIndex].shade_number, selectedPly, 'decrement')}
            >
              <Text style={styles.floatingActionBtnText}>−</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.floatingActionBtn, styles.btnPlus]}
              onPress={() => adjustSpringQuantity(filteredShades[selectedRowIndex].shade_number, selectedPly, 'increment')}
            >
              <Text style={styles.floatingActionBtnText}>+</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.floatingNavBtn}
              onPress={() => setSelectedRowIndex(prev => Math.max(0, prev - 1))}
            >
              <Text style={styles.floatingNavBtnText}>▲</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.floatingNavBtn}
              onPress={() => setSelectedRowIndex(prev => Math.min(filteredShades.length - 1, prev + 1))}
            >
              <Text style={styles.floatingNavBtnText}>▼</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* MODAL 1: 1-PAGE PRINT OPTIONS (2-PLY, 3-PLY, BOTH) */}
      <Modal
        visible={printModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPrintModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>🖨️ 1-Page Spring Qty Print</Text>
              <TouchableOpacity onPress={() => setPrintModalVisible(false)}>
                <Text style={styles.closeModalText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Yeh format reference photo ki tarah ek hi A4 page par side-by-side columns mein print karega.
            </Text>

            {/* Print PLY Option */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Select PLY to Print:</Text>
              <View style={styles.optionRow}>
                <TouchableOpacity
                  style={[styles.radioCard, printPlyOption === 'both' && styles.radioCardActive]}
                  onPress={() => setPrintPlyOption('both')}
                >
                  <Text style={[styles.radioText, printPlyOption === 'both' && styles.radioTextActive]}>
                    Both (2-PLY & 3-PLY)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.radioCard, printPlyOption === '2ply' && styles.radioCardActive]}
                  onPress={() => setPrintPlyOption('2ply')}
                >
                  <Text style={[styles.radioText, printPlyOption === '2ply' && styles.radioTextActive]}>
                    2-PLY Only
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.radioCard, printPlyOption === '3ply' && styles.radioCardActive]}
                  onPress={() => setPrintPlyOption('3ply')}
                >
                  <Text style={[styles.radioText, printPlyOption === '3ply' && styles.radioTextActive]}>
                    3-PLY Only
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Print Scope */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Shades Scope:</Text>
              <View style={styles.optionRow}>
                <TouchableOpacity
                  style={[styles.radioCard, printScope === 'all_sequence' && styles.radioCardActive]}
                  onPress={() => setPrintScope('all_sequence')}
                >
                  <Text style={[styles.radioText, printScope === 'all_sequence' && styles.radioTextActive]}>
                    All Sequence (001 to End)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.radioCard, printScope === 'in_stock_only' && styles.radioCardActive]}
                  onPress={() => setPrintScope('in_stock_only')}
                >
                  <Text style={[styles.radioText, printScope === 'in_stock_only' && styles.radioTextActive]}>
                    Only In Stock (&gt; 0)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.printPreviewSummaryBox}>
              <Text style={styles.printSummaryText}>
                📄 Page Layout: Multi-column side-by-side table on A4 portrait (fits completely on 1 page).
              </Text>
              <Text style={styles.printSummaryText}>
                🔢 Sequence: Natural numeric order ({stockData?.shades.length || 0} shades available).
              </Text>
            </View>

            {/* Modal Actions */}
            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setPrintModalVisible(false)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: '#2B6CB0' }]}
                onPress={executeOnePagePrint}
              >
                <Text style={styles.submitBtnText}>🖨️ Print 1-Page Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: MANUAL / SET SPRINGS */}
      <Modal
        visible={manualModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setManualModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>➕ Enter Spring Stock Qty</Text>
              <TouchableOpacity onPress={() => setManualModalVisible(false)}>
                <Text style={styles.closeModalText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Shade ki direct 2-PLY &amp; 3-PLY physical springs inventory count set karein.
            </Text>

            {/* Shade Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Shade Number *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. 001, 120, 219"
                placeholderTextColor={colors.textSecondary}
                value={manualShade}
                onChangeText={setManualShade}
              />
            </View>

            {/* 2-PLY and 3-PLY Springs */}
            <View style={styles.inputsRow}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={[styles.inputLabel, { color: '#1D4ED8' }]}>2-PLY Springs</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  value={manualSprings2}
                  onChangeText={setManualSprings2}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={[styles.inputLabel, { color: '#7E22CE' }]}>3-PLY Springs</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  value={manualSprings3}
                  onChangeText={setManualSprings3}
                />
              </View>
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
                onPress={handleSaveDirectSprings}
                disabled={submittingManual}
              >
                {submittingManual ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Save Springs</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: MODIFY PENDING TASK BATCH (AVAILABLE UNTIL COMPLETED) */}
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
                ⚠️ Rule: Change option available hai jab tak ki task complete nahi ho jaata. Ek baar complete mark hone ke baad locked ho jayega.
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
                <Text style={[styles.inputLabel, { color: '#1D4ED8' }]}>2-PLY Springs</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                  keyboardType="numeric"
                  value={taskSprings2Ply}
                  onChangeText={setTaskSprings2Ply}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={[styles.inputLabel, { color: '#7E22CE' }]}>3-PLY Springs</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                  keyboardType="numeric"
                  value={taskSprings3Ply}
                  onChangeText={setTaskSprings3Ply}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Lot Weight (kg) - Optional</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                placeholder="Weight"
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
    paddingVertical: 14,
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
    gap: 12,
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  backButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 110,
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    minWidth: 150,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E5E7EB',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginVertical: 3,
  },
  kpiUnit: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D1D5DB',
  },
  kpiSub: {
    fontSize: 11,
    color: '#F3F4F6',
    opacity: 0.9,
  },
  keyboardNoticeBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  keyboardNoticeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  keyboardNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  toggleGuideText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  keysListGrid: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#BFDBFE',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  keyItem: {
    fontSize: 11,
    color: '#1E3A8A',
    width: '48%',
  },
  keyBadge: {
    backgroundColor: '#DBEAFE',
    color: '#1E40AF',
    fontWeight: 'bold',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  controlsCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  searchAndTabsRow: {
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  clearSearchText: {
    fontSize: 14,
    color: '#9CA3AF',
    paddingHorizontal: 6,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tabItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#9CA3AF20',
  },
  tabItemActive: {
    backgroundColor: '#2563EB',
  },
  tabItemText: {
    fontSize: 11,
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
    marginTop: 10,
    fontSize: 13,
  },
  emptyCard: {
    padding: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptySubtitle: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  addFirstBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addFirstBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  // TABLE FORMAT
  tableContainer: {
    borderRadius: 10,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderBottomWidth: 2,
    borderBottomColor: '#1F2937',
    paddingVertical: 9,
    paddingHorizontal: 6,
  },
  thCol: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  thText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  tableRowSelected: {
    backgroundColor: '#DBEAFE',
    borderLeftWidth: 6,
    borderLeftColor: '#2563EB',
    borderRightWidth: 4,
    borderRightColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  tableRowHasStock: {
    backgroundColor: '#F0FDF430',
  },
  colNum: {
    width: 80,
    alignItems: 'center',
  },
  colPly: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  colTotal: {
    width: 90,
    alignItems: 'center',
  },
  colActions: {
    width: 130,
    alignItems: 'center',
  },
  tdCol: {
    justifyContent: 'center',
  },
  numberBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  numberBadgeSelected: {
    backgroundColor: '#2563EB',
    transform: [{ scale: 1.05 }],
  },
  numberText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  numberTextSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  subProgramText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  activeCellHighlight: {
    backgroundColor: '#DBEAFE',
    borderRadius: 8,
    paddingVertical: 2,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  btnMinus: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  btnPlus: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  stepperBtnText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1F2937',
    lineHeight: 20,
  },
  qtyDisplayBox: {
    minWidth: 50,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyNumberText: {
    fontSize: 16,
    fontWeight: '900',
  },
  qtyUnitLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6B7280',
  },
  totalSpringsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    minWidth: 45,
    alignItems: 'center',
  },
  badgeActive: {
    backgroundColor: '#10B98125',
    borderWidth: 1.5,
    borderColor: '#10B981',
  },
  badgeZero: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  totalSpringsText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  textActive: {
    color: '#047857',
  },
  textZero: {
    color: '#9CA3AF',
  },
  changeLotBtn: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  changeLotBtnText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
  },
  editValuesBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
  },
  editValuesBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
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
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  closeModalText: {
    fontSize: 20,
    color: '#9CA3AF',
    fontWeight: 'bold',
  },
  modalSubtitle: {
    fontSize: 12,
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  radioCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  radioCardActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  radioText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  radioTextActive: {
    color: '#1D4ED8',
    fontWeight: '800',
  },
  printPreviewSummaryBox: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    gap: 4,
  },
  printSummaryText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '500',
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
    marginTop: 14,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontWeight: '600',
    fontSize: 12,
  },
  submitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  lockNoticeBox: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  lockNoticeText: {
    color: '#92400E',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  modalTaskDetails: {
    fontSize: 12,
    marginBottom: 10,
    fontWeight: '600',
  },
  // FLOATING STICKY ACTIVE BAR
  floatingActiveBar: {
    position: 'absolute',
    bottom: 16,
    left: '50%',
    transform: [{ translateX: -230 }],
    width: 460,
    maxWidth: '94%',
    borderRadius: 30,
    borderWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 999,
  },
  floatingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  floatingActiveTag: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  floatingActiveTagText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  floatingShadeNum: {
    fontSize: 16,
    fontWeight: '900',
  },
  floatingRowIdx: {
    fontSize: 11,
    fontWeight: '600',
  },
  floatingCenter: {
    flexDirection: 'row',
    gap: 6,
  },
  floatingPlyToggle: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  floatingPlyToggleActive2P: {
    backgroundColor: '#DBEAFE',
    borderColor: '#3B82F6',
  },
  floatingPlyToggleActive3P: {
    backgroundColor: '#F3E8FF',
    borderColor: '#A855F7',
  },
  floatingPlyToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  floatingPlyToggleTextActive: {
    fontWeight: '800',
    color: '#1E293B',
  },
  floatingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  floatingActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingActionBtnText: {
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
  },
  floatingNavBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingNavBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#374151',
  },
});
