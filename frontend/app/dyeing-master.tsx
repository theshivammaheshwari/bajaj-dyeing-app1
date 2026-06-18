import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, SafeAreaView, StatusBar, Alert, Platform, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { getBackendBaseUrl } from '../lib/api-base';
import { useTheme } from '../context/ThemeContext';
import { printCompletedTasksPdf, printAllTasksPdf } from '../lib/pdf-utils';

const EXPO_PUBLIC_BACKEND_URL = getBackendBaseUrl();
const MACHINES = [
  { id: 'm1', name: 'M1', capacity: 10.5, totalSprings: 7 },
  { id: 'm2', name: 'M2', capacity: 12, totalSprings: 8 },
  { id: 'm3', name: 'M3', capacity: 12, totalSprings: 8 },
  { id: 'm4', name: 'M4', capacity: 6, totalSprings: 4 },
  { id: 'm5', name: 'M5', capacity: 24, totalSprings: 16 },
];

const showAlert = (title: string, message: string, onOk?: () => void) => {
  if (Platform.OS === 'web') {
    alert(`${title}: ${message}`);
    if (onOk) onOk();
  } else {
    Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
  }
};

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    const confirmed = window.confirm(`${title}\n\n${message}`);
    if (confirmed) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

const LiveTimer = ({ startTime }: { startTime: string }) => {
  const [duration, setDuration] = useState('');

  useEffect(() => {
    if (!startTime) return;
    
    const updateTimer = () => {
      const diff = new Date().getTime() - new Date(startTime).getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const remainingMin = minutes % 60;
      setDuration(hours > 0 ? `${hours}h ${remainingMin}m` : `${minutes}m`);
    };

    updateTimer(); // Initial call
    const interval = setInterval(updateTimer, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [startTime]);

  return <Text style={{ color: '#d97706', fontSize: 12, fontWeight: 'bold' }}>⏱️ {duration}</Text>;
};

export default function DyeingMaster() {
  const router = useRouter();
  const { colors } = useTheme();
  const [dailyTask, setDailyTask] = useState<any>(null);
  const [payment, setPayment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [weightInputs, setWeightInputs] = useState<{ [key: string]: { ply2: string; ply3: string } }>({});
  const [activeTab, setActiveTab] = useState<'manual' | 'automatic'>('manual');
  const [isUpdating, setIsUpdating] = useState<{ [taskId: string]: boolean }>({});
  const [editingShade, setEditingShade] = useState<string | null>(null);
  const [editingShadeText, setEditingShadeText] = useState<string>('');
  const [assigningMachine, setAssigningMachine] = useState<{ [key: number]: string }>({});
  
  const handleLogout = async () => {
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
      if (confirmed) performLogout();
      return;
    }

    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: performLogout },
    ]);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  useEffect(() => {
    if (date === new Date().toISOString().split('T')[0]) {
      checkAndRollover();
    } else {
      fetchTodayTask(true);
    }
  }, [date]);

  const checkAndRollover = async () => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks/${yesterdayStr}`);
      const yesterdayData = await response.json();

      if (yesterdayData.id) {
        let hasPending = false;
        const machines = ['m1', 'm2', 'm3', 'm4', 'm5'];
        for (const m of machines) {
          const tasks = yesterdayData[m] || [];
          if (tasks.some((t: any) => t.status === 'pending' || !t.status)) {
            hasPending = true;
            break;
          }
        }

        if (hasPending) {
          const rolloverResponse = await fetch(
            `${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks/rollover-pending?from_date=${yesterdayStr}&to_date=${date}`,
            { method: 'POST' }
          );
          const result = await rolloverResponse.json();
          console.log('Auto-rollover:', result);
        }
      }

      fetchTodayTask();
    } catch (error) {
      console.error('Rollover check error:', error);
      fetchTodayTask();
    }
  };

  const fetchTodayTask = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) setLoading(true);
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks/${date}`);
      const data = await response.json();
      if (data.id) {
        setDailyTask(data);
        fetchPayment(data.id);
        initializeWeightInputs(data, isInitialLoad);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  };

  const initializeWeightInputs = (task: any, isInitialLoad: boolean = false) => {
    setWeightInputs(prev => {
      // If it's a fresh load (like date change), start with empty.
      // Otherwise, we merge with current local "draft" values.
      const nextInputs = isInitialLoad ? {} : { ...prev };
      
      const machines = ['m1', 'm2', 'm3', 'm4', 'm5'];
      machines.forEach(machineId => {
        const tasks = task[machineId] || [];
        tasks.forEach((t: any, index: number) => {
          const key = `${machineId}-${t.id || index}`;
          
          // Only overwrite if we don't have a local draft OR it's a fresh page load
          if (isInitialLoad || !nextInputs[key]) {
            nextInputs[key] = {
              ply2: t.ply2_weight && t.ply2_weight > 0 ? t.ply2_weight.toFixed(3) : '',
              ply3: t.ply3_weight && t.ply3_weight > 0 ? t.ply3_weight.toFixed(3) : '',
            };
          }
        });
      });
  
      const autoTasks = task.automatic_tasks || [];
      autoTasks.forEach((t: any, index: number) => {
        const key = `automatic_tasks-${t.id || index}`;
        if (isInitialLoad || !nextInputs[key]) {
          nextInputs[key] = {
            ply2: t.ply2_weight && t.ply2_weight > 0 ? t.ply2_weight.toFixed(3) : '',
            ply3: t.ply3_weight && t.ply3_weight > 0 ? t.ply3_weight.toFixed(3) : '',
          };
        }
      });
  
      return nextInputs;
    });
  };

  const handleAssignAutomaticToMachine = async (taskIndex: number) => {
    const machineId = assigningMachine[taskIndex];
    if (!machineId) {
      showAlert('Error', 'Please select a machine first');
      return;
    }

    try {
      setLoading(true);
      
      const newAutoTasks = [...(dailyTask.automatic_tasks || [])];
      newAutoTasks[taskIndex] = {
        ...newAutoTasks[taskIndex],
        machine: machineId,
        status: 'pending'
      };

      const payload = {
        date,
        m1: dailyTask.m1 || [],
        m2: dailyTask.m2 || [],
        m3: dailyTask.m3 || [],
        m4: dailyTask.m4 || [],
        m5: dailyTask.m5 || [],
        automatic_tasks: newAutoTasks,
      };

      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks/${dailyTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        showAlert('Success', `Task assigned to ${machineId.toUpperCase()}`);
        setAssigningMachine(prev => { const next = {...prev}; delete next[taskIndex]; return next; });
        fetchTodayTask();
      } else {
        showAlert('Error', 'Failed to assign task');
      }
    } catch (error) {
      console.error('Assign error:', error);
      showAlert('Error', 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const fetchPayment = async (taskId: string) => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks/${taskId}/payment-calculation`);
      const data = await response.json();
      setPayment(data);
    } catch (error) {
      console.error('Payment error:', error);
    }
  };

  const updateLocalWeight = (machineId: string, taskId: string, field: 'ply2' | 'ply3', value: string) => {
    const key = `${machineId}-${taskId}`;
    setWeightInputs(prev => ({
      ...prev,
      [key]: { 
        ...(prev[key] || { ply2: '', ply3: '' }), 
        [field]: value 
      },
    }));
  };

  const saveWeight = async (machineId: string, taskId: string, field: 'ply2' | 'ply3') => {
    const key = `${machineId}-${taskId}`;
    const value = weightInputs[key]?.[field] || '0';
    const numValue = parseFloat(value) || 0;
    const apiField = field === 'ply2' ? 'ply2_weight' : 'ply3_weight';
    await updateTaskFields(machineId, taskId, { [apiField]: numValue });
  };

  const saveShadeNumber = async (machineId: string, taskId: string, originalShade: string) => {
    if (!editingShadeText.trim()) {
      showAlert('Error', 'Shade number cannot be empty');
      return;
    }
    
    // Only update if it actually changed
    if (editingShadeText.trim() !== originalShade) {
      await updateTaskFields(machineId, taskId, { 
        shade_number: editingShadeText.trim(),
        original_shade_number: originalShade,
        is_modified: true
      });
    }
    
    setEditingShade(null);
  };

  const updateTaskFields = async (machineId: string, taskId: string, updates: Record<string, any>) => {
    if (isUpdating[taskId]) return;
    try {
      setIsUpdating(prev => ({ ...prev, [taskId]: true }));
      
      // Optimistic Update
      setDailyTask((prev: any) => {
        if (!prev) return prev;
        const newTasks = [...(prev[machineId] || [])];
        const taskIndex = newTasks.findIndex((t: any) => t.id === taskId);
        
        // Fallback to index if no ID found (for backward compatibility)
        let actualIndex = taskIndex;
        if (taskIndex === -1 && !isNaN(parseInt(taskId))) {
           actualIndex = parseInt(taskId);
        }

        if (actualIndex !== -1 && actualIndex < newTasks.length) {
          newTasks[actualIndex] = { ...newTasks[actualIndex], ...updates };
        }
        return { ...prev, [machineId]: newTasks };
      });

      const params = new URLSearchParams({
        machine_id: machineId,
        machine_task_id: taskId,
      });
      Object.keys(updates).forEach(k => params.append(k, updates[k].toString()));

      const res = await fetch(
        `${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks/${dailyTask.id}/update-machine-task?${params.toString()}`,
        { method: 'PUT' }
      );
      if (!res.ok) throw new Error('Update failed');
      // Background fetch to ensure consistency later, but don't reset inputs
      fetchTodayTask(false);
    } catch (error) {
      console.error('Error updating:', error);
      showAlert('Error', 'Update failed');
      fetchTodayTask(); // Revert optimistic UI on failure
    } finally {
      setIsUpdating(prev => ({ ...prev, [taskId]: false }));
    }
  };

  const calculateDurationString = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMin = minutes % 60;
    return hours > 0 ? `${hours}h ${remainingMin}m` : `${minutes} min`;
  };

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return '--:--';
    const d = new Date(isoString);
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    return `${hours}:${minutes} ${ampm}`;
  };

  const isTaskLocked = (completedAt?: string | null) => {
    if (!completedAt) return false;
    const now = new Date();
    const completedTime = new Date(completedAt);
    const diff = now.getTime() - completedTime.getTime();
    return diff > 24 * 60 * 60 * 1000;
  };

  const startTask = (machineId: string, taskId: string) => {
    const time = new Date().toISOString();
    updateTaskFields(machineId, taskId, { start_time: time, status: 'in-progress' });
  };

  const completeTask = (machineId: string, taskId: string, startTime?: string) => {
    const time = new Date().toISOString();
    let payload: any = { end_time: time, completed_at: time, status: 'completed' };
    if (startTime) {
      payload.duration = calculateDurationString(startTime, time);
    }
    updateTaskFields(machineId, taskId, payload);
  };

  const rejectTask = (machineId: string, taskId: string, startTime?: string) => {
    showConfirm('Reject Lot', 'Are you sure this lot is damaged/rejected?', () => {
      const time = new Date().toISOString();
      let payload: any = { end_time: time, completed_at: time, status: 'rejected' };
      if (startTime) {
        payload.duration = calculateDurationString(startTime, time);
      }
      updateTaskFields(machineId, taskId, payload);
    });
  };

  const revokeTask = async (machineId: string, taskId: string, taskStatus: string) => {
    const message =
      taskStatus === 'completed'
        ? 'Undo this completed task? It will go back to pending.'
        : 'Reset this task? All progress will be cleared.';

    showConfirm('Reset Task', message, async () => {
      await updateTaskFields(machineId, taskId, { status: 'pending' });
      const key = `${machineId}-${taskId}`;
      setWeightInputs(prev => ({ ...prev, [key]: { ply2: '', ply3: '' } }));
      showAlert('Success', 'Task reset to pending');
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return colors.success;
      case 'rejected': return colors.danger;
      case 'in-progress': return colors.secondary;
      default: return colors.textSecondary;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'completed': return '#F0FFF4';
      case 'rejected': return '#FFF5F5';
      case 'in-progress': return '#EBF8FF';
      default: return 'transparent';
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />

      <View style={[styles.header, { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, shadowColor: colors.shadow }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Text style={[styles.backBtnText, { color: colors.primary }]}>← Back</Text>
          </TouchableOpacity>
          <Image
            source={require('../assets/images/logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Dyeing Master</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Worker Panel</Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.logoutButton, { backgroundColor: colors.danger }]} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.dateBar, { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        <View style={[styles.dateInputContainer, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
          <TextInput
            style={[styles.dateInput, { color: colors.primary }]}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
          />
        </View>
        {Platform.OS === 'web' && dailyTask && (
          <View style={styles.pdfButtonRow}>
            <TouchableOpacity
              style={[styles.pdfButton, { backgroundColor: colors.success }]}
              onPress={() => printCompletedTasksPdf(dailyTask, date)}
            >
              <Text style={styles.pdfButtonText}>📄 Completed PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pdfButton, { backgroundColor: colors.primary }]}
              onPress={() => printAllTasksPdf(dailyTask, date)}
            >
              <Text style={styles.pdfButtonText}>📄 All Tasks PDF</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 10, padding: 15, paddingBottom: 0 }}>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'manual' ? { backgroundColor: colors.primary, borderColor: colors.primary } : {backgroundColor: colors.card, borderColor: colors.border}]}
          onPress={() => setActiveTab('manual')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'manual' ? { color: '#fff' } : { color: colors.text }]}>Pre-filled Tasks (Manual)</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'automatic' ? { backgroundColor: colors.primary, borderColor: colors.primary } : {backgroundColor: colors.card, borderColor: colors.border}]}
          onPress={() => setActiveTab('automatic')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'automatic' ? { color: '#fff' } : { color: colors.text }]}>Automatic Tasks</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.verticalScrollView}
        contentContainerStyle={styles.verticalScrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >
        <ScrollView
          style={styles.horizontalScrollView}
          contentContainerStyle={styles.horizontalScrollContent}
          horizontal={true}
          showsHorizontalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.gridContainer}>
            {/* Machine Header Row */}
            <View style={[styles.gridRow, Platform.OS === 'web' && { position: 'sticky', top: 0, zIndex: 10, backgroundColor: colors.background, paddingBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 3 } as any]}>
              <View style={styles.rowNumberCell}>
                <Text style={[styles.rowNumberText, { color: colors.textSecondary }]}>#</Text>
              </View>
              {MACHINES.map(machine => {
                const tasks = activeTab === 'manual'
                  ? (dailyTask?.[machine.id] || [])
                  : (dailyTask?.automatic_tasks || []).filter((t: any) => t.machine === machine.id);
                
                const totalSpringsUsed = tasks.reduce(
                  (sum: number, task: any) => sum + (task.springs_2ply || 0) + (task.springs_3ply || 0),
                  0
                );
                return (
                  <View key={machine.id} style={[styles.machineInfoCard, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.machineNameText, { color: '#fff' }]}>{machine.name}</Text>
                    <View style={styles.machineStats}>
                      <Text style={[styles.machineWeightText, { color: 'rgba(255,255,255,0.75)' }]}>
                        {machine.capacity}kg
                      </Text>
                      <Text style={[styles.machineCountText, { color: '#fff' }]}>
                        {totalSpringsUsed}/{machine.totalSprings}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Task Grid Rows */}
            {!dailyTask && !loading ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No tasks found for {date}</Text>
              </View>
            ) : (
              Array.from({ 
                length: activeTab === 'manual' 
                  ? Math.max(5, ...MACHINES.map(m => (dailyTask?.[m.id] || []).length)) 
                  : Math.max(1, ...MACHINES.map(m => (dailyTask?.automatic_tasks || []).filter((t:any) => t.machine === m.id).length)) 
              }).map((_, rowIndex) => (
                <View key={rowIndex} style={styles.gridRow}>
                  <View style={styles.rowNumberCell}>
                    <Text style={[styles.rowNumberText, { color: colors.textSecondary }]}>{rowIndex + 1}</Text>
                  </View>
                  {MACHINES.map(machine => {
                    const tasks = activeTab === 'manual'
                      ? (dailyTask?.[machine.id] || [])
                      : (dailyTask?.automatic_tasks || []).map((t: any, idx: number) => ({...t, originalIndex: idx})).filter((t: any) => t.machine === machine.id);
                    const task = tasks[rowIndex];
                    const targetMachineForApi = activeTab === 'manual' ? machine.id : 'automatic_tasks';
                    const targetIndexForApi = activeTab === 'manual' ? rowIndex : (task ? task.originalIndex : 0);
                    const taskIdForApi = task ? (task.id || targetIndexForApi.toString()) : targetIndexForApi.toString();
                    const weightInputKey = `${targetMachineForApi}-${taskIdForApi}`;
                    const updating = isUpdating[taskIdForApi];
                    const locked = task ? isTaskLocked(task.completed_at) : false;
                    return (
                      <View
                        key={machine.id}
                        style={[
                          styles.gridCell,
                          { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow },
                          task ? { backgroundColor: getStatusBg(task.status) } : null,
                          updating && { opacity: 0.6 }
                        ]}
                      >
                        {task ? (
                          <View style={{ flex: 1, flexDirection: 'column' }}>
                            <View style={[styles.cellHeader, { paddingBottom: 6, marginBottom: 6, borderBottomWidth: editingShade === weightInputKey ? 0 : 1 }]}>
                              {editingShade === weightInputKey ? (
                                <View style={{ flexDirection: 'column', width: '100%' }}>
                                  <TextInput
                                    style={{ 
                                      color: colors.text, 
                                      backgroundColor: '#fff', 
                                      borderColor: colors.primary, 
                                      borderWidth: 1.5, 
                                      borderRadius: 8, 
                                      width: '100%',
                                      height: 36, 
                                      paddingHorizontal: 10, 
                                      fontSize: 16, 
                                      fontWeight: 'bold',
                                      marginBottom: 8
                                    }}
                                    value={editingShadeText}
                                    onChangeText={setEditingShadeText}
                                    autoFocus
                                    placeholder="Lot #"
                                  />
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <TouchableOpacity 
                                      onPress={() => setEditingShade(null)} 
                                      style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f1f5f9', borderRadius: 6, flex: 0.48, alignItems: 'center' }}
                                    >
                                      <Text style={{ color: '#475569', fontSize: 13, fontWeight: 'bold' }}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                      onPress={() => saveShadeNumber(targetMachineForApi, taskIdForApi, task.shade_number)} 
                                      style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#16a34a', borderRadius: 6, flex: 0.48, alignItems: 'center' }}
                                    >
                                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>Save</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              ) : (
                                <>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                    <Text style={[styles.cellShadeText, { color: colors.primary, fontSize: 18 }]} numberOfLines={1}>
                                      #{task.shade_number}
                                    </Text>
                                    {!locked && (
                                      <TouchableOpacity onPress={() => {
                                        setEditingShadeText(task.shade_number);
                                        setEditingShade(weightInputKey);
                                      }} style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#e2e8f0', borderRadius: 6 }}>
                                        <Text style={{ color: '#475569', fontSize: 11, fontWeight: 'bold' }}>EDIT</Text>
                                      </TouchableOpacity>
                                    )}
                                  </View>

                                  {editingShade !== weightInputKey && (
                                    <View style={styles.statusToggle}>
                                      <Text
                                        style={[
                                          styles.statusIndicator,
                                          { color: getStatusColor(task.status) },
                                        ]}
                                      >
                                        {task.status === 'completed'
                                          ? '✓'
                                          : task.status === 'rejected'
                                          ? '✕'
                                          : task.status === 'in-progress'
                                          ? '●'
                                          : '○'}
                                      </Text>
                                    </View>
                                  )}
                                </>
                              )}
                            </View>

                            {/* Tags / Badges */}
                            {(task.is_modified || task.carried_forward) && (
                              <View style={{ flexDirection: 'column', marginBottom: 6 }}>
                                {task.is_modified && (
                                  <Text style={{ fontSize: 9, color: '#D97706', backgroundColor: '#FEF3C7', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 2, fontWeight: 'bold' }}>
                                    Changed from #{task.original_shade_number}
                                  </Text>
                                )}
                                {task.carried_forward && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                    <View style={{ backgroundColor: '#F59E0B', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, marginRight: 4 }}>
                                      <Text style={{ fontSize: 9, color: '#FFFFFF', fontWeight: 'bold' }}>C/F</Text>
                                    </View>
                                    <Text style={{ fontSize: 9, color: '#2563EB', fontWeight: 'bold' }}>
                                      Prev: {task.original_date}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            )}

                            {locked && (
                              <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4, marginBottom: 6 }}>
                                <Text style={{ color: '#B91C1C', fontSize: 10, fontWeight: 'bold', textAlign: 'center' }}>🔒 Locked (24h passed)</Text>
                              </View>
                            )}

                            <View style={styles.summaryWeights}>
                              <Text style={[styles.summaryWeightText, { color: colors.text }]}>
                                W: {(parseFloat(task.ply2_weight || '0') + parseFloat(task.ply3_weight || '0')).toFixed(2)}kg
                              </Text>
                              <Text style={[styles.summarySpringText, { color: colors.textSecondary }]}>
                                S: {task.springs_2ply + task.springs_3ply}
                              </Text>
                            </View>

                            {/* Time Tracking */}
                            {(task.start_time || task.end_time || task.duration) && (
                              <View style={{ backgroundColor: '#f8fafc', padding: 8, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                                {task.start_time && (
                                  <Text style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>Start: <Text style={{ fontWeight: 'bold', color: '#0f172a' }}>{formatTime(task.start_time)}</Text></Text>
                                )}
                                {task.end_time && (
                                  <Text style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>End: <Text style={{ fontWeight: 'bold', color: '#0f172a' }}>{formatTime(task.end_time)}</Text></Text>
                                )}
                                {task.status === 'in-progress' && task.start_time && (
                                  <LiveTimer startTime={task.start_time} />
                                )}
                                {task.duration && (
                                  <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: 'bold', marginTop: 2 }}>
                                    ✓ Taken: {task.duration}
                                  </Text>
                                )}
                              </View>
                            )}

                            {/* Admin Planned Values (Reference Only) */}
                            <View style={{ flexDirection: 'row', backgroundColor: '#eff6ff', padding: 8, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#bfdbfe', justifyContent: 'space-around', alignItems: 'center' }}>
                              <View style={{ alignItems: 'center' }}>
                                <Text style={{ fontSize: 9, color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Admin 2P</Text>
                                <Text style={{ fontSize: 13, color: '#1d4ed8', fontWeight: '900' }}>{task.springs_2ply || 0}</Text>
                              </View>
                              <View style={{ width: 1, height: 20, backgroundColor: '#bfdbfe' }} />
                              <View style={{ alignItems: 'center' }}>
                                <Text style={{ fontSize: 9, color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Admin 3P</Text>
                                <Text style={{ fontSize: 13, color: '#1d4ed8', fontWeight: '900' }}>{task.springs_3ply || 0}</Text>
                              </View>
                            </View>

                            <View style={styles.inlineEditor}>
                              <View style={styles.weightInputsContainer}>
                                <View style={styles.weightInputWrap}>
                                  <Text style={[styles.weightLabel, { color: colors.textSecondary }]}>2P kg</Text>
                                  <TextInput
                                    style={[
                                      styles.smallInput,
                                      { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.border },
                                    ]}
                                    value={weightInputs[weightInputKey]?.ply2 || ''}
                                    onChangeText={val => updateLocalWeight(targetMachineForApi, taskIdForApi, 'ply2', val)}
                                    onBlur={() => saveWeight(targetMachineForApi, taskIdForApi, 'ply2')}
                                    keyboardType="decimal-pad"
                                    placeholder="0"
                                    placeholderTextColor={colors.textSecondary}
                                    editable={!updating && !locked}
                                  />
                                </View>
                                <View style={styles.weightInputWrap}>
                                  <Text style={[styles.weightLabel, { color: colors.textSecondary }]}>3P kg</Text>
                                  <TextInput
                                    style={[
                                      styles.smallInput,
                                      { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.border },
                                    ]}
                                    value={weightInputs[weightInputKey]?.ply3 || ''}
                                    onChangeText={val => updateLocalWeight(targetMachineForApi, taskIdForApi, 'ply3', val)}
                                    onBlur={() => saveWeight(targetMachineForApi, taskIdForApi, 'ply3')}
                                    keyboardType="decimal-pad"
                                    placeholder="0"
                                    placeholderTextColor={colors.textSecondary}
                                    editable={!updating && !locked}
                                  />
                                </View>
                              </View>

                              <View style={styles.actionButtons}>
                                {task.status !== 'in-progress' &&
                                  task.status !== 'completed' &&
                                  task.status !== 'rejected' && (
                                    <TouchableOpacity
                                      style={[styles.smallActionButton, { backgroundColor: colors.primary }]}
                                      onPress={() => startTask(targetMachineForApi, taskIdForApi)}
                                      disabled={updating || locked}
                                    >
                                      <Text style={styles.actionButtonText}>Start</Text>
                                    </TouchableOpacity>
                                  )}
                                {task.status === 'in-progress' && (
                                  <View style={styles.progressActions}>
                                    <TouchableOpacity
                                      style={[styles.smallActionButton, { backgroundColor: colors.success }]}
                                      onPress={() => completeTask(targetMachineForApi, taskIdForApi, task.start_time)}
                                      disabled={updating}
                                    >
                                      <Text style={styles.actionButtonText}>✓</Text>
                                    </TouchableOpacity>
                                    {!(task.shade_number?.toLowerCase().includes('black return')) && (
                                      <TouchableOpacity
                                        style={[styles.smallActionButton, { backgroundColor: colors.danger }]}
                                        onPress={() => rejectTask(targetMachineForApi, taskIdForApi, task.start_time)}
                                        disabled={updating}
                                      >
                                        <Text style={styles.actionButtonText}>✕</Text>
                                      </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                      style={[styles.smallActionButton, { backgroundColor: colors.textSecondary }]}
                                      onPress={() => revokeTask(targetMachineForApi, taskIdForApi, task.status)}
                                      disabled={updating}
                                    >
                                      <Text style={styles.actionButtonText}>↺</Text>
                                    </TouchableOpacity>
                                  </View>
                                )}
                                {(task.status === 'completed' || task.status === 'rejected') && !locked && (
                                  <TouchableOpacity
                                    style={[styles.smallActionButton, { backgroundColor: colors.textSecondary, width: '100%' }]}
                                    onPress={() => revokeTask(targetMachineForApi, taskIdForApi, task.status)}
                                    disabled={updating}
                                  >
                                    <Text style={styles.actionButtonText}>Reset</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          </View>
                        ) : (
                          <Text style={[styles.emptyCellText, { color: colors.textSecondary }]}>-</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))
            )}

            {payment && (
              <View style={[styles.paymentCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}>
                <Text style={[styles.paymentTitle, { color: colors.text }]}>💰 Payment Summary</Text>
                <View style={styles.paymentFlex}>
                  <View style={[styles.paymentStat, { backgroundColor: '#F0FFF4', borderRadius: 12, padding: 12 }]}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Completed</Text>
                    <Text style={[styles.statValue, { color: colors.success }]}>₹{payment.completed_payment ?? 0}</Text>
                    <Text style={[styles.statSub, { color: colors.textSecondary }]}>{payment.completed_kg ?? 0} kg</Text>
                  </View>
                  <View style={[styles.paymentStat, { backgroundColor: '#FFF5F5', borderRadius: 12, padding: 12 }]}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rejected</Text>
                    <Text style={[styles.statValue, { color: colors.danger }]}>₹{payment.rejected_payment ?? 0}</Text>
                    <Text style={[styles.statSub, { color: colors.textSecondary }]}>{payment.rejected_kg ?? 0} kg</Text>
                  </View>
                  <View style={[styles.paymentStat, { backgroundColor: colors.primaryLight, borderRadius: 12, padding: 12 }]}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Earnings</Text>
                    <Text style={[styles.statValueTotal, { color: colors.primary }]}>₹{payment.total_payment ?? 0}</Text>
                    <Text style={[styles.statSub, { color: colors.textSecondary }]}>{payment.total_kg ?? 0} kg</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </ScrollView>
      {/* If Tab is manual, that's it! Render is over. If Automatic, we also need the Unassigned tasks floating above the grid! */}
      {activeTab === 'automatic' && (
        <ScrollView style={{ paddingHorizontal: 15, paddingTop: 10, maxHeight: 250 }}>
          <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 10, color: colors.text }}>⚡ Unassigned Automatic Tasks</Text>
          {!dailyTask?.automatic_tasks || dailyTask.automatic_tasks.filter((t:any) => !t.machine).length === 0 ? (
            <Text style={{ textAlign: 'center', marginBottom: 20, color: colors.textSecondary }}>No Unassigned Tasks</Text>
          ) : (
            dailyTask.automatic_tasks.map((task: any, index: number) => {
              if (task.machine) return null;
              return (
              <View key={index} style={{ backgroundColor: colors.card, padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 16, color: colors.text }}>Shade #{task.shade_number}</Text>
                  <Text style={{ color: colors.textSecondary }}>Weight: {task.weight} kg</Text>
                </View>
                
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
                  <View style={{ flex: 1, backgroundColor: colors.background, padding: 8, borderRadius: 8 }}>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>2P Springs</Text>
                    <Text style={{ fontWeight: 'bold', color: colors.text }}>{task.springs_2ply}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.background, padding: 8, borderRadius: 8 }}>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>3P Springs</Text>
                    <Text style={{ fontWeight: 'bold', color: colors.text }}>{task.springs_3ply}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>Select Machine</Text>
                    {Platform.OS === 'web' ? (
                      <select
                        style={{ padding: 8, borderRadius: 6, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.inputBackground, color: colors.text }}
                        value={assigningMachine[index] || ''}
                        onChange={(e) => setAssigningMachine(prev => ({ ...prev, [index]: e.target.value }))}
                      >
                        <option value="">-- Machine --</option>
                        {MACHINES.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    ) : (
                      <TextInput
                         style={[{ padding: 8, borderRadius: 6, borderColor: colors.border, borderWidth: 1 }, { color: colors.text }]}
                         placeholder="Native dropdown placeholder"
                      />
                    )}
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, justifyContent: 'center' }}
                    onPress={() => handleAssignAutomaticToMachine(index)}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Assign to Machine</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )})
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    paddingVertical: 6,
    paddingRight: 4,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  headerLogo: {
    width: 38,
    height: 38,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
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
    fontWeight: 'bold',
    fontSize: 13,
  },
  dateBar: {
    padding: 12,
  },
  dateInputContainer: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignSelf: 'center',
  },
  dateInput: {
    fontSize: 16,
    fontWeight: 'bold',
    paddingVertical: 8,
    textAlign: 'center',
  },
  verticalScrollView: {
    flex: 1,
  },
  verticalScrollContent: {
    flexGrow: 1,
  },
  horizontalScrollView: {
    flex: 1,
  },
  horizontalScrollContent: {
    paddingBottom: 20,
  },
  gridContainer: {
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 40,
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
    width: 220,
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
    width: 220,
    minHeight: 120,
    marginHorizontal: 4,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    position: 'relative',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  activeGridCell: {
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  cellHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    paddingBottom: 6,
    marginBottom: 8,
  },
  cellShadeText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusToggle: {
    padding: 4,
  },
  statusIndicator: {
    fontSize: 18,
  },
  inlineEditor: {
    flex: 1,
  },
  weightInputsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weightInputWrap: {
    flex: 0.48,
  },
  weightLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  smallInput: {
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    borderWidth: 1.5,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  progressActions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  smallActionButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  cellSummary: {
    flex: 1,
    justifyContent: 'center',
  },
  summaryWeights: {
    alignItems: 'center',
  },
  summaryWeightText: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  summarySpringText: {
    fontSize: 12,
  },
  emptyCellText: {
    textAlign: 'center',
    marginTop: 10,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
  },
  paymentCard: {
    marginTop: 24,
    marginHorizontal: 8,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    width: 920,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  paymentTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  paymentFlex: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  paymentStat: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 13,
    marginBottom: 4,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statValueTotal: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statSub: {
    fontSize: 12,
    marginTop: 4,
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
  },
  completedCell: {
    opacity: 0.9,
  },
  rejectedCell: {
    opacity: 0.9,
  },
  progressCell: {
    opacity: 1,
  },
  pdfButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    justifyContent: 'center',
  },
  pdfButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  pdfButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  tabBtnText: {
    fontWeight: 'bold',
    fontSize: 14,
  }
});