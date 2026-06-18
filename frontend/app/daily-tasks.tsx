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
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { getBackendBaseUrl } from '../lib/api-base';
import { useTheme } from '../context/ThemeContext';
import { printDailyTaskPdf } from '../lib/pdf-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EXPO_PUBLIC_BACKEND_URL = getBackendBaseUrl();

const MACHINES = [
  { id: 'm1', name: 'M1', capacity: 10.5, totalSprings: 7 },
  { id: 'm2', name: 'M2', capacity: 12, totalSprings: 8 },
  { id: 'm3', name: 'M3', capacity: 12, totalSprings: 8 },
  { id: 'm4', name: 'M4', capacity: 6, totalSprings: 4 },
  { id: 'm5', name: 'M5', capacity: 24, totalSprings: 16 },
];

interface MachineTask {
  shade_id: string;
  shade_number: string;
  springs_2ply: number;
  springs_3ply: number;
  weight: number;
  type?: 'manual' | 'automatic';
}

interface DailyTask {
  id: string;
  date: string;
  m1?: MachineTask[];
  m2?: MachineTask[];
  m3?: MachineTask[];
  m4?: MachineTask[];
  m5?: MachineTask[];
  automatic_tasks?: MachineTask[];
}

export default function DailyTasks() {
  const router = useRouter();
  const { colors } = useTheme();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');
  const [taskTypeFilter, setTaskTypeFilter] = useState<'all' | 'manual' | 'automatic'>('all');

  useEffect(() => {
    fetchTasks();
    
    // Set today as default active working date for Calculator
    const setTodayAsDefault = async () => {
      const today = new Date().toISOString().split('T')[0];
      const current = await AsyncStorage.getItem('active_working_date');
      if (!current) {
        await AsyncStorage.setItem('active_working_date', today);
      }
    };
    setTodayAsDefault();
  }, []);

  // Save active working date for Calculator integration
  useEffect(() => {
    const saveActiveDate = async () => {
      // YYYY-MM-DD is 10 chars
      if (dateFilter.trim().length === 10) {
        await AsyncStorage.setItem('active_working_date', dateFilter.trim());
      }
    };
    saveActiveDate();
  }, [dateFilter]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks`);
      const data = await response.json();
      setTasks(data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      Alert.alert('Error', 'Failed to load daily tasks');
    } finally {
      setLoading(false);
    }
  };

  const isTaskLocked = (completedAt?: string | null) => {
    if (!completedAt) return false;
    const now = new Date();
    const completedTime = new Date(completedAt);
    const diff = now.getTime() - completedTime.getTime();
    return diff > 24 * 60 * 60 * 1000;
  };

  const filteredTasks = dateFilter.trim()
    ? tasks.filter(t => t.date.includes(dateFilter.trim()))
    : tasks;

  const deleteTask = async (id: string) => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        if (Platform.OS === 'web') alert('Task deleted successfully!');
        else Alert.alert('Success', 'Task deleted successfully');
        fetchTasks();
      } else {
        const errorData = await response.json();
        if (Platform.OS === 'web') alert(errorData.detail || 'Failed to delete task');
        else Alert.alert('Error', errorData.detail || 'Failed to delete task');
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      if (Platform.OS === 'web') alert('Failed to delete task');
      else Alert.alert('Error', 'Failed to delete task');
    }
  };

  const handleDeletePress = (id: string, date: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Kya aap sure hain ki ${date} ka task delete karna hai?`);
      if (confirmed) deleteTask(id);
    } else {
      Alert.alert('Delete Task', `Are you sure you want to delete task for ${date}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteTask(id) },
      ]);
    }
  };

  const handlePdfDownload = (task: DailyTask) => {
    if (Platform.OS === 'web') {
      printDailyTaskPdf(task);
    } else {
      // Fallback: use backend PDF for native
      const pdfUrl = `${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks/${task.id}/pdf`;
      WebBrowser.openBrowserAsync(pdfUrl);
    }
  };

  const handleWhatsAppShare = async (id: string) => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks/${id}/whatsapp-text`);
      const data = await response.json();
      if (data.text) {
        const encodedText = encodeURIComponent(data.text);
        const whatsappUrl = `https://wa.me/?text=${encodedText}`;
        if (Platform.OS === 'web') window.open(whatsappUrl, '_blank');
        else {
          const canOpen = await Linking.canOpenURL(whatsappUrl);
          if (canOpen) await Linking.openURL(whatsappUrl);
          else Alert.alert('Error', 'WhatsApp is not installed');
        }
      }
    } catch (error) {
      console.error('Error sharing to WhatsApp:', error);
      Alert.alert('Error', 'Failed to share to WhatsApp');
    }
  };

  const getMachineTasks = (task: DailyTask, machineId: string) => {
    const autoTasks = (task.automatic_tasks || []) as any[];
    const manualTasks = (task[machineId as keyof DailyTask] || []) as any[];
    
    let combined: any[] = [];
    if (taskTypeFilter === 'all' || taskTypeFilter === 'manual') {
      combined = [...combined, ...manualTasks];
    }
    if (taskTypeFilter === 'all' || taskTypeFilter === 'automatic') {
      combined = [...combined, ...autoTasks.filter(t => t.machine === machineId)];
    }
    return combined;
  };

  const getMaxRows = (task: DailyTask) => {
    return Math.max(
      ...(MACHINES.map(m => getMachineTasks(task, m.id).length)),
      1
    );
  };

  const renderTaskGrid = (task: DailyTask) => {
    const maxRows = getMaxRows(task);

    return (
      <View key={task.id} style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}>
        {/* Task Header with date + actions */}
        <View style={styles.taskHeader}>
          <Text style={[styles.dateText, { color: colors.text }]}>📅 {task.date}</Text>
          <View style={styles.taskActions}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.secondary }]}
              onPress={() => router.push(`/edit-daily-task?taskId=${task.id}`)}
            >
              <Text style={styles.actionBtnText}>✏️ Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.danger }]}
              onPress={() => handleDeletePress(task.id, task.date)}
            >
              <Text style={styles.actionBtnText}>🗑 Delete</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Share Row */}
        <View style={styles.shareRow}>
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: '#E53E3E' }]}
            onPress={() => handlePdfDownload(task)}
          >
            <Text style={styles.shareBtnText}>📄 PDF Download</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: '#25D366' }]}
            onPress={() => handleWhatsAppShare(task.id)}
          >
            <Text style={styles.shareBtnText}>📱 WhatsApp Share</Text>
          </TouchableOpacity>
        </View>

        {/* Grid - same layout as Add Daily Task */}
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View style={styles.gridContainer}>
            {/* Machine Header Row */}
            <View style={[styles.gridRow, Platform.OS === 'web' && { position: 'sticky', top: 0, zIndex: 10, backgroundColor: colors.background, paddingBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 3 } as any]}>
              <View style={styles.rowNumberCell}>
                <Text style={[styles.rowNumberText, { color: colors.textSecondary }]}>#</Text>
              </View>
              {MACHINES.map(machine => (
                <View key={machine.id} style={[styles.machineInfoCard, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.machineNameText, { color: '#fff' }]}>{machine.name}</Text>
                  <View style={styles.machineStats}>
                    <Text style={[styles.machineWeightText, { color: 'rgba(255,255,255,0.75)' }]}>
                      {machine.capacity}kg
                    </Text>
                    <Text style={[styles.machineCountText, { color: '#fff' }]}>
                      Cap: {machine.totalSprings}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Task Grid Rows */}
            {Array.from({ length: maxRows }).map((_, rowIndex) => (
              <View key={rowIndex} style={styles.gridRow}>
                <View style={styles.rowNumberCell}>
                  <Text style={[styles.rowNumberText, { color: colors.textSecondary }]}>{rowIndex + 1}</Text>
                </View>
                {MACHINES.map(machine => {
                  const machineTasks = getMachineTasks(task, machine.id);
                  const mt = machineTasks[rowIndex];

                  return (
                    <View
                      key={machine.id}
                      style={[
                        styles.gridCell,
                        { backgroundColor: colors.card, borderColor: colors.border },
                        mt && [styles.filledGridCell, { backgroundColor: '#e8f5e9' }],
                      ]}
                    >
                      {mt ? (
                        <>
                          <View style={styles.cellHeader}>
                            <Text style={[styles.cellShadeText, { color: colors.primary }]}>
                              #{mt.shade_number}
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 4 }}>
                              {mt.carried_forward && (
                                <View style={{ backgroundColor: '#F59E0B', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 }}>
                                  <Text style={{ fontSize: 9, color: '#FFFFFF', fontWeight: 'bold' }}>C/F</Text>
                                </View>
                              )}
                              <View 
                                style={{ 
                                  backgroundColor: mt.type === 'automatic' ? colors.success + '20' : colors.primary + '20', 
                                  paddingHorizontal: 6, 
                                  paddingVertical: 2, 
                                  borderRadius: 4 
                                }}
                              >
                                <Text 
                                  style={{ 
                                    fontSize: 10, 
                                    fontWeight: 'bold', 
                                    color: mt.type === 'automatic' ? colors.success : colors.primary 
                                  }}
                                >
                                  {mt.type === 'automatic' ? 'Auto' : 'Manual'}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <View style={styles.cellSummary}>
                            <View style={styles.summaryPlyRow}>
                              <View style={styles.summaryPlyItem}>
                                <Text style={[styles.summaryPlyLabel, { color: colors.textSecondary }]}>2P</Text>
                                <Text style={[styles.summaryPlyValue, { color: colors.text }]}>{mt.springs_2ply}</Text>
                              </View>
                              <View style={styles.summaryPlyItem}>
                                <Text style={[styles.summaryPlyLabel, { color: colors.textSecondary }]}>3P</Text>
                                <Text style={[styles.summaryPlyValue, { color: colors.text }]}>{mt.springs_3ply}</Text>
                              </View>
                            </View>
                            <Text style={[styles.summaryTotalText, { color: colors.primary }]}>
                              Total: {mt.springs_2ply + mt.springs_3ply}/{machine.totalSprings}
                            </Text>
                          </View>
                        </>
                      ) : (
                        <Text style={[styles.emptyCellText, { color: colors.textSecondary }]}>-</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, shadowColor: colors.shadow }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={handleBack}>
            <Text style={[styles.backLink, { color: colors.primary }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Daily Machine Tasks</Text>
        </View>

        <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginBottom: 15, gap: 10 }}>
          <TouchableOpacity
            style={[styles.actionBtn, { flex: 1, backgroundColor: taskTypeFilter === 'all' ? colors.primary : colors.card, borderColor: colors.border, borderWidth: 1 }]}
            onPress={() => setTaskTypeFilter('all')}
          >
            <Text style={{ textAlign: 'center', fontWeight: '600', color: taskTypeFilter === 'all' ? '#fff' : colors.text }}>Show All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { flex: 1, backgroundColor: taskTypeFilter === 'manual' ? colors.primary : colors.card, borderColor: colors.border, borderWidth: 1 }]}
            onPress={() => setTaskTypeFilter('manual')}
          >
            <Text style={{ textAlign: 'center', fontWeight: '600', color: taskTypeFilter === 'manual' ? '#fff' : colors.text }}>Manual Only</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { flex: 1, backgroundColor: taskTypeFilter === 'automatic' ? colors.primary : colors.card, borderColor: colors.border, borderWidth: 1 }]}
            onPress={() => setTaskTypeFilter('automatic')}
          >
            <Text style={{ textAlign: 'center', fontWeight: '600', color: taskTypeFilter === 'automatic' ? '#fff' : colors.text }}>Auto Only</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.dateFilterContainer, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
          <TextInput
            style={[styles.dateFilterInput, { color: colors.text }]}
            placeholder="🔍 Filter by date (e.g. 2026-04)"
            placeholderTextColor={colors.textSecondary}
            value={dateFilter}
            onChangeText={setDateFilter}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading tasks...</Text>
        </View>
      ) : filteredTasks.length === 0 ? (
        <View style={styles.centerContent}>
          <Text style={[styles.emptyText, { color: colors.text }]}>
            {dateFilter ? 'No tasks found for this date' : 'No tasks created yet'}
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            {!dateFilter && 'Tap + button to add today\'s task'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          {filteredTasks.map(task => renderTaskGrid(task))}
        </ScrollView>
      )}

      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
        onPress={() => router.push('/add-daily-task')}
      >
        <Text style={styles.addButtonText}>+ Add Daily Task</Text>
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
    paddingTop: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  backLink: {
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
  },
  dateFilterContainer: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
  },
  dateFilterInput: {
    fontSize: 14,
    paddingVertical: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  taskCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  taskActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  shareRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  shareBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  shareBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  // Grid styles matching add-daily-task
  gridContainer: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  gridRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  rowNumberCell: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  machineInfoCard: {
    width: 180,
    marginHorizontal: 4,
    padding: 12,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  machineNameText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#fff',
  },
  machineStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  machineWeightText: {
    fontSize: 12,
    fontWeight: '600',
  },
  machineCountText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  gridCell: {
    width: 180,
    minHeight: 120,
    marginHorizontal: 4,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    position: 'relative',
  },
  filledGridCell: {},
  cellHeader: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    paddingBottom: 6,
    marginBottom: 8,
  },
  cellShadeText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  cellSummary: {
    flex: 1,
    justifyContent: 'center',
  },
  summaryPlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryPlyItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryPlyLabel: {
    fontSize: 12,
    marginRight: 4,
  },
  summaryPlyValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  summaryTotalText: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'right',
    marginTop: 4,
  },
  emptyCellText: {
    textAlign: 'center',
    marginTop: 10,
    fontSize: 14,
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
