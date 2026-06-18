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
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getBackendBaseUrl } from '../lib/api-base';
import { useTheme } from '../context/ThemeContext';

const EXPO_PUBLIC_BACKEND_URL = getBackendBaseUrl();

const MACHINES = [
  { id: 'm1', name: 'M1', capacity: 10.5, totalSprings: 7 },
  { id: 'm2', name: 'M2', capacity: 12, totalSprings: 8 },
  { id: 'm3', name: 'M3', capacity: 12, totalSprings: 8 },
  { id: 'm4', name: 'M4', capacity: 6, totalSprings: 4 },
  { id: 'm5', name: 'M5', capacity: 24, totalSprings: 16 },
];

interface Shade {
  id: string;
  shade_number: string;
  original_weight?: number;
}

interface AutoAssignRow {
  id: string;
  shadeId: string;
  shadeNumber: string;
  weight: number | '';
  machineId: string;
  springs2ply: string;
  springs3ply: string;
}

interface MachineTaskData {
  id: string;
  shadeId: string;
  shadeNumber: string;
  springs2ply: string;
  springs3ply: string;
  showShadeDropdown: boolean;
  shadeSearchText: string;
  error?: string;
}

const emptyTask = (machineId: string, index: number): MachineTaskData => ({
  id: `${machineId}-${index}`,
  shadeId: '',
  shadeNumber: '',
  springs2ply: '',
  springs3ply: '',
  showShadeDropdown: false,
  shadeSearchText: '',
  error: '',
});

const initialMachineTasks = () => {
  const tasks: { [key: string]: MachineTaskData[] } = {};
  MACHINES.forEach(m => {
    tasks[m.id] = Array.from({ length: 5 }, (_, i) => emptyTask(m.id, i));
  });
  return tasks;
};

export default function AddDailyTask() {
  const router = useRouter();
  const { colors } = useTheme();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [shades, setShades] = useState<Shade[]>([]);
  const [loading, setLoading] = useState(false);
  const [machineTasks, setMachineTasks] = useState<{ [key: string]: MachineTaskData[] }>(initialMachineTasks());
  const [activeTask, setActiveTask] = useState<{ machineId: string; taskId: string } | null>(null);
  const [saveError, setSaveError] = useState('');
  
  const [activeTab, setActiveTab] = useState<'manual' | 'automatic'>('manual');
  
  const [autoAssignRows, setAutoAssignRows] = useState<AutoAssignRow[]>([]);
  const [existingAutomaticTasks, setExistingAutomaticTasks] = useState<any[]>([]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  useEffect(() => {
    fetchShades();
    fetchExistingTask();
  }, [date]);

  const fetchExistingTask = async () => {
    try {
      console.log('Fetching tasks for date:', date);
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks/${date}`);
      const data = await response.json();

      if (data.id) {
        console.log('Found existing task:', data.id);
        const newMachineTasks: { [key: string]: MachineTaskData[] } = {};
        MACHINES.forEach(m => {
          const apiTasks = data[m.id] || [];
          newMachineTasks[m.id] = apiTasks.map((t: any, idx: number) => ({
            id: `${m.id}-${idx}`,
            shadeId: t.shade_id || '',
            shadeNumber: t.shade_number ? String(t.shade_number) : '',
            springs2ply: t.springs_2ply !== undefined ? String(t.springs_2ply) : '0',
            springs3ply: t.springs_3ply !== undefined ? String(t.springs_3ply) : '0',
            showShadeDropdown: false,
            shadeSearchText: t.shade_number ? String(t.shade_number) : '',
            error: '',
          }));
          while (newMachineTasks[m.id].length < 5) {
            newMachineTasks[m.id].push(emptyTask(m.id, newMachineTasks[m.id].length));
          }
        });
        setMachineTasks(newMachineTasks);
        setExistingAutomaticTasks(data.automatic_tasks || []);
      } else {
        console.log('No tasks found for this date, resetting grid');
        setMachineTasks(initialMachineTasks());
        setExistingAutomaticTasks([]);
      }
    } catch (error) {
      console.error('Error fetching existing task:', error);
    }
  };

  const fetchShades = async () => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/shades`);
      const data = await response.json();
      const sortedShades = data.sort((a: Shade, b: Shade) => {
        const numA = parseInt(a.shade_number) || 0;
        const numB = parseInt(b.shade_number) || 0;
        return numA - numB;
      });
      setShades(sortedShades);
    } catch (error) {
      console.error('Error fetching shades:', error);
    }
  };

  const updateTask = (machineId: string, taskId: string, field: string, value: string | boolean) => {
    const machine = MACHINES.find(m => m.id === machineId);
    const max = machine?.totalSprings || 0;

    if (field === 'shadeId') {
      const selectedShade = shades.find(s => s.id === value);
      setMachineTasks(prev => ({
        ...prev,
        [machineId]: prev[machineId].map(task =>
          task.id === taskId
            ? {
                ...task,
                shadeId: value as string,
                shadeNumber: selectedShade?.shade_number || '',
                shadeSearchText: selectedShade?.shade_number || '',
                showShadeDropdown: false,
              }
            : task
        ),
      }));
    } else if (field === 'springs2ply' || field === 'springs3ply') {
      const numVal = parseInt(value as string) || 0;
      let error = '';

      if (numVal < 0) {
        error = 'Cannot be negative';
      } else if (numVal > max) {
        error = `Exceeds capacity (${max})`;
      }

      if (error) {
        // Set error but still allow the value to show
        setMachineTasks(prev => ({
          ...prev,
          [machineId]: prev[machineId].map(task =>
            task.id === taskId
              ? { ...task, [field]: value, error }
              : task
          ),
        }));
        return;
      }

      const otherField = field === 'springs2ply' ? 'springs3ply' : 'springs2ply';
      const otherVal = Math.max(0, max - numVal).toString();
      setMachineTasks(prev => ({
        ...prev,
        [machineId]: prev[machineId].map(task =>
          task.id === taskId
            ? { ...task, [field]: value, [otherField]: otherVal, error: '' }
            : task
        ),
      }));
    } else {
      setMachineTasks(prev => ({
        ...prev,
        [machineId]: prev[machineId].map(task =>
          task.id === taskId ? { ...task, [field]: value } : task
        ),
      }));
    }
  };

  const getFilteredShades = (searchText: string) => {
    if (!searchText.trim()) return shades;
    return shades.filter(shade =>
      shade.shade_number.toLowerCase().includes(searchText.toLowerCase())
    );
  };

  const addRow = () => {
    setMachineTasks(prev => {
      const updated = { ...prev };
      MACHINES.forEach(machine => {
        const newTask: MachineTaskData = {
          id: Date.now().toString() + Math.random(),
          shadeId: '',
          shadeNumber: '',
          springs2ply: '',
          springs3ply: '',
          showShadeDropdown: false,
          shadeSearchText: '',
          error: '',
        };
        updated[machine.id] = [...updated[machine.id], newTask];
      });
      return updated;
    });
  };

  const deleteRow = (rowIndex: number) => {
    const doDelete = () => {
      setMachineTasks(prev => {
        const updated = { ...prev };
        MACHINES.forEach(machine => {
          updated[machine.id] = prev[machine.id].filter((_, idx) => idx !== rowIndex);
        });
        // Ensure at least 1 row remains
        const hasRows = updated[MACHINES[0].id].length > 0;
        if (!hasRows) {
          MACHINES.forEach(machine => {
            updated[machine.id] = [emptyTask(machine.id, 0)];
          });
        }
        return updated;
      });
      // Close active task if it was in deleted row
      setActiveTask(null);
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Are you sure you want to delete Task ${rowIndex + 1}?`);
      if (confirmed) doDelete();
    } else {
      Alert.alert(
        'Delete Task',
        `Are you sure you want to delete Task ${rowIndex + 1}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const showAlert = (title: string, message: string, onOk?: () => void) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
      if (onOk) onOk();
    } else {
      Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
    }
  };

  const validateAndSave = async () => {
    setSaveError('');
    if (!date) {
      setSaveError('Please select a date');
      return;
    }

    // Check for per-task capacity errors
    for (const machine of MACHINES) {
      const tasks = machineTasks[machine.id];
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (task.shadeId) {
          const ply2 = parseInt(task.springs2ply) || 0;
          const ply3 = parseInt(task.springs3ply) || 0;
          const total = ply2 + ply3;
          if (total > machine.totalSprings) {
            setSaveError(`${machine.name} Task ${i + 1}: Total (${total}) exceeds capacity (${machine.totalSprings})`);
            return;
          }
          if (ply2 < 0 || ply3 < 0) {
            setSaveError(`${machine.name} Task ${i + 1}: Values cannot be negative`);
            return;
          }
        }
      }
    }

    const payload: any = { date };
    let hasData = false;

    for (const machine of MACHINES) {
      const tasks = machineTasks[machine.id];
      const validTasks = [];

      for (const task of tasks) {
        if (task.shadeId) {
          const ply2 = parseInt(task.springs2ply) || 0;
          const ply3 = parseInt(task.springs3ply) || 0;
          validTasks.push({
            id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 11),
            shade_id: task.shadeId,
            shade_number: task.shadeNumber,
            springs_2ply: ply2,
            springs_3ply: ply3,
            weight: machine.capacity,
          });
        }
      }

      if (validTasks.length > 0) {
        payload[machine.id] = validTasks;
        hasData = true;
      }
    }

    if (!hasData && existingAutomaticTasks.length === 0) {
      setSaveError('Please add at least one task');
      return;
    }

    payload.automatic_tasks = existingAutomaticTasks;

    setLoading(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        showAlert('Success', 'Daily task saved successfully', () => router.back());
      } else {
        const error = await response.json();
        setSaveError(error.detail || 'Failed to add task');
      }
    } catch (error) {
      console.error('Error adding task:', error);
      setSaveError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignTasks = async () => {
    if (autoAssignRows.length === 0) {
      showAlert('Error', 'No tasks to assign.');
      return;
    }

    // 1. Validation
    for (let i = 0; i < autoAssignRows.length; i++) {
      const row = autoAssignRows[i];
      if (!row.shadeId || !row.weight || !row.springs2ply || !row.springs3ply) {
        showAlert('Error', `Row ${i + 1} has empty fields. Please fill all fields.`);
        return;
      }
      const ply2 = parseInt(row.springs2ply) || 0;
      const ply3 = parseInt(row.springs3ply) || 0;
      if (ply2 < 0 || ply3 < 0) {
        showAlert('Error', `Row ${i + 1}: Values cannot be negative.`);
        return;
      }
    }

    setLoading(true);
    try {
      // Fetch latest tasks for this date to prevent overriding manual tracking
      const getRes = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks/${date}`);
      const data = await getRes.json();

      const newAutoTasks = autoAssignRows.map(row => ({
        id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 11),
        shade_id: row.shadeId,
        shade_number: row.shadeNumber,
        springs_2ply: parseInt(row.springs2ply) || 0,
        springs_3ply: parseInt(row.springs3ply) || 0,
        weight: row.weight,
        type: 'automatic',
        machine: null
      }));

      const payload = {
        date,
        m1: data.m1 || [],
        m2: data.m2 || [],
        m3: data.m3 || [],
        m4: data.m4 || [],
        m5: data.m5 || [],
        automatic_tasks: [...(data.automatic_tasks || []), ...newAutoTasks]
      };

      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setAutoAssignRows([]);
        showAlert('Success', 'Tasks saved as Automatic and sent to Dyeing Master!');
        fetchExistingTask();
      } else {
        const error = await response.json();
        showAlert('Error', error.detail || 'Failed to save tasks');
      }
    } catch (error) {
      console.error('Error adding automatic tasks:', error);
      showAlert('Error', 'Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const addAutoAssignRow = () => {
    setAutoAssignRows(prev => [
      ...prev, 
      { id: Date.now().toString() + Math.random(), shadeId: '', shadeNumber: '', weight: '', machineId: '', springs2ply: '', springs3ply: '' }
    ]);
  };

  const updateAutoAssignRow = (rowId: string, field: keyof AutoAssignRow, value: any) => {
    setAutoAssignRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      
      const updatedRow = { ...row, [field]: value };
      
      if (field === 'shadeId') {
        const shade = shades.find(s => s.id === value);
        if (shade) {
          updatedRow.shadeNumber = shade.shade_number;
          if (!updatedRow.weight && shade.original_weight) {
             updatedRow.weight = shade.original_weight;
          }
        }
      }
      return updatedRow;
    }));
  };

  const removeAutoAssignRow = (rowId: string) => {
    setAutoAssignRows(prev => prev.filter(r => r.id !== rowId));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Add Daily Task</Text>
          <View style={[styles.headerActions]}>
            <View style={[styles.dateInputContainer, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
              <TextInput
                style={[styles.dateInput, { color: colors.primary }]}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, padding: 15, paddingBottom: 0 }}>
          <TouchableOpacity 
            style={[styles.tabBtn, activeTab === 'manual' ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setActiveTab('manual')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'manual' ? { color: '#fff' } : { color: colors.text }]}>Manual Tasks</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabBtn, activeTab === 'automatic' ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setActiveTab('automatic')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'automatic' ? { color: '#fff' } : { color: colors.text }]}>Automatic Tasks</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'manual' ? (
        <>
        <ScrollView
          style={styles.verticalScrollView}
          contentContainerStyle={styles.verticalScrollContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
        >
          <ScrollView
            style={styles.horizontalScrollView}
            contentContainerStyle={styles.horizontalScrollContent}
            showsHorizontalScrollIndicator={true}
            horizontal={true}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.gridContainer}>
              {/* Machine Header Row */}
              <View style={styles.gridRow}>
                <View style={styles.rowNumberCell}>
                  <Text style={[styles.rowNumberText, { color: colors.textSecondary }]}>#</Text>
                </View>
                {MACHINES.map(machine => {
                  return (
                    <View key={machine.id} style={[styles.machineInfoCard, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.machineNameText, { color: '#fff' }]}>{machine.name}</Text>
                      <View style={styles.machineStats}>
                        <Text style={[styles.machineWeightText, { color: 'rgba(255,255,255,0.7)' }]}>
                          {machine.capacity}kg
                        </Text>
                        <Text style={[styles.machineCountText, { color: '#fff' }]}>
                          Cap: {machine.totalSprings}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Task Grid Rows */}
              {Array.from({ length: machineTasks.m1.length }).map((_, rowIndex) => (
                <View key={rowIndex} style={[styles.gridRow, { zIndex: machineTasks.m1.length - rowIndex }]}>
                  <View style={styles.rowNumberCell}>
                    <Text style={[styles.rowNumberText, { color: colors.textSecondary }]}>{rowIndex + 1}</Text>
                    <TouchableOpacity
                      style={styles.deleteRowBtn}
                      onPress={() => deleteRow(rowIndex)}
                    >
                      <Text style={styles.deleteRowIcon}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                  {MACHINES.map(machine => {
                    const task = machineTasks[machine.id][rowIndex];
                    if (!task) return <View key={`${machine.id}-${rowIndex}`} style={[styles.gridCell, styles.placeholderCell]} />;
                    const isActive =
                      activeTask?.machineId === machine.id && activeTask?.taskId === task?.id;
                    const hasError = !!(task?.error);

                    return (
                      <View
                        key={machine.id}
                        style={[
                          styles.gridCell,
                          { backgroundColor: colors.card, borderColor: colors.border },
                          isActive && [styles.activeGridCell, { borderColor: colors.primary, borderWidth: 2 }],
                          task?.shadeId
                            ? [styles.filledGridCell, { backgroundColor: '#e8f5e9' }]
                            : null,
                          hasError && { borderColor: '#ef4444', borderWidth: 2 },
                          { zIndex: isActive ? 100 : 1 },
                        ]}
                      >
                        {task ? (
                          <>
                            <TouchableOpacity
                              style={styles.cellHeader}
                              onPress={() => {
                                setActiveTask(isActive ? null : { machineId: machine.id, taskId: task.id });
                              }}
                            >
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.cellShadeText,
                                  { color: colors.textSecondary },
                                  task.shadeNumber ? [styles.filledText, { color: colors.primary }] : null,
                                ]}
                              >
                                {task.shadeNumber ? `#${task.shadeNumber}` : 'Select Shade'}
                              </Text>
                              {!isActive && (
                                <Text style={[styles.editIcon, { color: colors.textSecondary }]}>✎</Text>
                              )}
                            </TouchableOpacity>

                            {isActive ? (
                              <View style={[styles.inlineEditor, { backgroundColor: colors.card, borderColor: colors.primary }]}>
                                <View style={styles.inlineHeaderActions}>
                                  <TextInput
                                    style={[styles.inlineShadeInput, { color: colors.text, borderBottomColor: colors.border }]}
                                    placeholder="Shade #"
                                    placeholderTextColor={colors.textSecondary}
                                    value={task.shadeSearchText}
                                    onChangeText={value => {
                                      updateTask(machine.id, task.id, 'shadeSearchText', value);
                                      updateTask(machine.id, task.id, 'showShadeDropdown', true);
                                    }}
                                    onFocus={() => updateTask(machine.id, task.id, 'showShadeDropdown', true)}
                                    keyboardType="number-pad"
                                    autoFocus
                                  />
                                  <TouchableOpacity
                                    onPress={() => setActiveTask(null)}
                                    style={styles.closeEditorBtn}
                                  >
                                    <Text style={{ color: colors.danger, fontWeight: 'bold' }}>✕</Text>
                                  </TouchableOpacity>
                                </View>

                                {task.showShadeDropdown && (
                                  <View
                                    style={[
                                      styles.inlineDropdown,
                                      { backgroundColor: colors.card, borderColor: colors.primary },
                                    ]}
                                  >
                                    <ScrollView
                                      nestedScrollEnabled={true}
                                      keyboardShouldPersistTaps="handled"
                                      style={{ maxHeight: 150 }}
                                    >
                                      {getFilteredShades(task.shadeSearchText).length > 0 ? (
                                        getFilteredShades(task.shadeSearchText).map(shade => (
                                          <TouchableOpacity
                                            key={shade.id}
                                            style={[styles.inlineDropdownItem, { borderBottomColor: colors.border }]}
                                            onPress={() => updateTask(machine.id, task.id, 'shadeId', shade.id)}
                                          >
                                            <Text style={[styles.inlineDropdownText, { color: colors.text }]}>
                                              #{shade.shade_number}
                                            </Text>
                                          </TouchableOpacity>
                                        ))
                                      ) : (
                                        <View style={styles.inlineDropdownItem}>
                                          <Text style={[styles.inlineDropdownText, { color: colors.textSecondary }]}>
                                            No Match
                                          </Text>
                                        </View>
                                      )}
                                    </ScrollView>
                                  </View>
                                )}

                                <View style={styles.inlinePlyRow}>
                                  <View style={styles.inlinePlyInputWrap}>
                                    <Text style={[styles.inlinePlyLabel, { color: colors.textSecondary }]}>2P</Text>
                                    <TextInput
                                      style={[
                                        styles.inlinePlyInput,
                                        { color: colors.text, backgroundColor: colors.inputBackground },
                                        hasError && { borderColor: '#ef4444', borderWidth: 1 },
                                      ]}
                                      value={task.springs2ply}
                                      onChangeText={val => updateTask(machine.id, task.id, 'springs2ply', val)}
                                      keyboardType="number-pad"
                                      placeholder="0"
                                      placeholderTextColor={colors.textSecondary}
                                    />
                                  </View>
                                  <View style={styles.inlinePlyInputWrap}>
                                    <Text style={[styles.inlinePlyLabel, { color: colors.textSecondary }]}>3P</Text>
                                    <TextInput
                                      style={[
                                        styles.inlinePlyInput,
                                        { color: colors.text, backgroundColor: colors.inputBackground },
                                        hasError && { borderColor: '#ef4444', borderWidth: 1 },
                                      ]}
                                      value={task.springs3ply}
                                      onChangeText={val => updateTask(machine.id, task.id, 'springs3ply', val)}
                                      keyboardType="number-pad"
                                      placeholder="0"
                                      placeholderTextColor={colors.textSecondary}
                                    />
                                  </View>
                                </View>
                                {hasError && (
                                  <Text style={styles.cellErrorText}>⚠ {task.error}</Text>
                                )}
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={styles.cellSummary}
                                onPress={() => setActiveTask({ machineId: machine.id, taskId: task.id })}
                              >
                                <View style={styles.summaryPlyRow}>
                                  <View style={styles.summaryPlyItem}>
                                    <Text style={[styles.summaryPlyLabel, { color: colors.textSecondary }]}>2P:</Text>
                                    <Text style={[styles.summaryPlyValue, { color: colors.text }]}>
                                      {task.springs2ply || 0}
                                    </Text>
                                  </View>
                                  <View style={styles.summaryPlyItem}>
                                    <Text style={[styles.summaryPlyLabel, { color: colors.textSecondary }]}>3P:</Text>
                                    <Text style={[styles.summaryPlyValue, { color: colors.text }]}>
                                      {task.springs3ply || 0}
                                    </Text>
                                  </View>
                                </View>
                                <Text style={[styles.summaryTotalText, { color: colors.primary }]}>
                                  Total: {(parseInt(task.springs2ply) || 0) + (parseInt(task.springs3ply) || 0)}/{machine.totalSprings}
                                </Text>
                                {hasError && (
                                  <Text style={styles.cellErrorText}>⚠ {task.error}</Text>
                                )}
                              </TouchableOpacity>
                            )}
                          </>
                        ) : (
                          <Text style={[styles.emptyCellText, { color: colors.textSecondary }]}>-</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}

              <TouchableOpacity
                style={[styles.gridAddRowButton, { borderColor: colors.primary }]}
                onPress={addRow}
              >
                <Text style={[styles.gridAddRowText, { color: colors.primary }]}>+ Add New Row</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </ScrollView>

        {saveError ? (
          <View style={styles.saveErrorContainer}>
            <Text style={styles.saveErrorText}>⚠ {saveError}</Text>
          </View>
        ) : null}

        <View
          style={[
            styles.footer,
            { backgroundColor: colors.headerBackground, borderTopColor: colors.border },
          ]}
        >
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primary }, loading && { opacity: 0.7 }]}
            onPress={validateAndSave}
            disabled={loading}
          >
            <Text style={styles.saveButtonText}>{loading ? 'Saving...' : 'Save All Tasks'}</Text>
          </TouchableOpacity>
        </View>
        </>
        ) : (
        <>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingHorizontal: 15, paddingTop: 10 }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>📋 Automatic Tasks Editor</Text>
          </View>

          <ScrollView contentContainerStyle={styles.modalScroll}>
            {autoAssignRows.length === 0 ? (
              <Text style={[styles.emptyCartText, { color: colors.textSecondary }]}>
                No tasks added yet. Click "+ Add Task Row" below.
              </Text>
            ) : (
              autoAssignRows.map((row, index) => (
                <View key={row.id} style={[styles.selectionRow, { borderColor: colors.border, backgroundColor: colors.card, marginBottom: 10 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ fontWeight: 'bold', color: colors.text }}>Task #{index + 1}</Text>
                    <TouchableOpacity onPress={() => removeAutoAssignRow(row.id)}>
                      <Text style={{ color: colors.danger, fontWeight: 'bold' }}>✕ Remove</Text>
                    </TouchableOpacity>
                  </View>
                  
                  {/* Select Shade */}
                  <View style={{ marginBottom: 10 }}>
                    <Text style={{ color: colors.textSecondary, marginBottom: 5 }}>Shade</Text>
                    {Platform.OS === 'web' ? (
                      <select
                        style={{ ...styles.webSelect, color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.border }}
                        value={row.shadeId}
                        onChange={(e) => updateAutoAssignRow(row.id, 'shadeId', e.target.value)}
                      >
                        <option value="">-- Select Shade --</option>
                        {shades.map(s => (
                          <option key={s.id} value={s.id}>#{s.shade_number}</option>
                        ))}
                      </select>
                    ) : (
                      <TextInput
                         style={[styles.smallInput, { color: colors.text, borderColor: colors.border }]}
                         placeholder="Native dropdown placeholder"
                      />
                    )}
                  </View>

                  {/* Weight Row (No Machine) */}
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textSecondary, marginBottom: 5 }}>Weight</Text>
                      {Platform.OS === 'web' ? (
                        <select
                          style={{ ...styles.webSelect, color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.border }}
                          value={row.weight.toString()}
                          onChange={(e) => updateAutoAssignRow(row.id, 'weight', e.target.value ? Number(e.target.value) : '')}
                        >
                          <option value="">Weight</option>
                          {[6, 10.5, 12, 24].map(w => (
                            <option key={w} value={w}>{w} kg</option>
                          ))}
                        </select>
                      ) : null}
                    </View>
                  </View>

                  {/* 2P & 3P Inputs Row */}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textSecondary, marginBottom: 5 }}>2P Springs</Text>
                      <TextInput
                        style={[styles.smallInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }]}
                        keyboardType="numeric"
                        value={row.springs2ply}
                        onChangeText={(v) => updateAutoAssignRow(row.id, 'springs2ply', v)}
                        placeholder="0"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textSecondary, marginBottom: 5 }}>3P Springs</Text>
                      <TextInput
                        style={[styles.smallInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }]}
                        keyboardType="numeric"
                        value={row.springs3ply}
                        onChangeText={(v) => updateAutoAssignRow(row.id, 'springs3ply', v)}
                        placeholder="0"
                      />
                    </View>
                  </View>
                </View>
              ))
            )}

            <TouchableOpacity 
              style={[styles.gridAddRowButton, { borderColor: colors.primary, marginTop: 15 }]} 
              onPress={addAutoAssignRow}
            >
              <Text style={[styles.gridAddRowText, { color: colors.primary }]}>+ Add Line Item</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={[styles.modalFooter, { borderTopColor: colors.border, flexDirection: 'row', gap: 10 }]}>
            <TouchableOpacity
              style={[styles.proceedBtn, { backgroundColor: colors.card, flex: 1, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => {
                setAutoAssignRows([]);
              }}
            >
              <Text style={[styles.proceedBtnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.proceedBtn, { backgroundColor: colors.primary, flex: 2 }]}
              onPress={handleAssignTasks}
            >
              <Text style={styles.proceedBtnText}>👉 Assign Tasks</Text>
            </TouchableOpacity>
          </View>
        </>
        )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1000,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInputContainer: {
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 8,
  },
  dateInput: {
    fontSize: 14,
    fontWeight: 'bold',
    paddingVertical: 6,
    textAlign: 'center',
    minWidth: 90,
  },
  autoAssignButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  autoAssignButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
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
    flexGrow: 1,
  },
  gridContainer: {
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 20,
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
  deleteRowBtn: {
    marginTop: 4,
    padding: 2,
  },
  deleteRowIcon: {
    fontSize: 14,
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
  activeGridCell: {
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  filledGridCell: {},
  cellHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    paddingBottom: 6,
    marginBottom: 8,
  },
  cellShadeText: {
    fontSize: 15,
    fontWeight: 'bold',
    flex: 1,
  },
  filledText: {
    fontWeight: '800',
  },
  editIcon: {
    fontSize: 14,
    marginLeft: 4,
  },
  emptyCellText: {
    textAlign: 'center',
    marginTop: 10,
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
  cellErrorText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  inlineEditor: {
    flex: 1,
  },
  inlineHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  inlineShadeInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
    paddingVertical: 4,
    borderBottomWidth: 2,
  },
  closeEditorBtn: {
    padding: 4,
    marginLeft: 8,
  },
  inlineDropdown: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 8,
    zIndex: 1000,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  inlineDropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
  },
  inlineDropdownText: {
    fontSize: 14,
    fontWeight: '600',
  },
  inlinePlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  inlinePlyInputWrap: {
    flex: 0.48,
  },
  inlinePlyLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  inlinePlyInput: {
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  gridAddRowButton: {
    marginVertical: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  gridAddRowText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveErrorContainer: {
    backgroundColor: '#fef2f2',
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  saveErrorText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
  },
  saveButton: {
    width: '100%',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholderCell: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    elevation: 0,
    borderWidth: 0,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    width: '100%',
    height: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 15,
    borderBottomWidth: 1,
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  closeModalText: {
    fontSize: 24,
    color: '#666',
    fontWeight: '300',
  },
  modalScroll: {
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  selectionRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  shadePickerWrap: {
    backgroundColor: 'transparent',
  },
  webSelect: {
    width: '100%',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  smallInput: {
    width: '100%',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  weightButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 15,
  },
  weightSelectBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  weightSelectText: {
    fontSize: 16,
  },
  addToCartBtn: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  addToCartBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cartDivider: {
    height: 1,
    marginVertical: 20,
  },
  cartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  clearCartText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCartText: {
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 20,
  },
  cartList: {
    gap: 10,
  },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
  },
  cartItemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  cartShadeBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  cartShadeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cartWeightText: {
    fontSize: 16,
    fontWeight: '600',
  },
  removeCartText: {
    fontSize: 20,
    fontWeight: 'bold',
    paddingHorizontal: 5,
  },
  modalFooter: {
    paddingTop: 15,
    borderTopWidth: 1,
  },
  proceedBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proceedBtnText: {
    color: '#1da1f2',
    fontWeight: 'bold',
    fontSize: 16,
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