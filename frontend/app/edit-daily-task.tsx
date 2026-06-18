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
  completed_at?: string | null;
  carried_forward?: boolean;
  original_date?: string | null;
  status?: string;
  start_time?: string | null;
  end_time?: string | null;
  duration?: string | null;
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
  completed_at: null,
  carried_forward: false,
  original_date: null,
});

export default function EditDailyTask() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams();
  const { colors } = useTheme();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [shades, setShades] = useState<Shade[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState<{ machineId: string; taskId: string } | null>(null);
  const [saveError, setSaveError] = useState('');

  const [machineTasks, setMachineTasks] = useState<{ [key: string]: MachineTaskData[] }>({
    m1: Array.from({ length: 5 }, (_, i) => emptyTask('m1', i)),
    m2: Array.from({ length: 5 }, (_, i) => emptyTask('m2', i)),
    m3: Array.from({ length: 5 }, (_, i) => emptyTask('m3', i)),
    m4: Array.from({ length: 5 }, (_, i) => emptyTask('m4', i)),
    m5: Array.from({ length: 5 }, (_, i) => emptyTask('m5', i)),
  });

  const maxRows = Math.max(...Object.values(machineTasks).map(tasks => tasks.length), 5);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  useEffect(() => {
    fetchShades();
    if (taskId) {
      fetchExistingTask();
    }
  }, [taskId]);

  const fetchExistingTask = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks`);
      const allTasks = await response.json();
      const data = allTasks.find((t: any) => t.id === taskId);

      if (data) {
        setDate(data.date);
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
            completed_at: t.completed_at || null,
            carried_forward: t.carried_forward || false,
            original_date: t.original_date || null,
            status: t.status || 'pending',
            start_time: t.start_time || null,
            end_time: t.end_time || null,
            duration: t.duration || null,
          }));
          while (newMachineTasks[m.id].length < 5) {
            newMachineTasks[m.id].push(emptyTask(m.id, newMachineTasks[m.id].length));
          }
        });
        setMachineTasks(newMachineTasks);
      }
    } catch (error) {
      setSaveError('Could not load existing task data');
    } finally {
      setLoading(false);
    }
  };

  const fetchShades = async () => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/shades`);
      const data = await response.json();
      setShades(data.sort((a: Shade, b: Shade) => (parseInt(a.shade_number) || 0) - (parseInt(b.shade_number) || 0)));
    } catch (error) {
      console.error('Error fetching shades:', error);
    }
  };

  const isTaskLocked = (completedAt?: string | null) => {
    if (!completedAt) return false;
    const now = new Date();
    const completedTime = new Date(completedAt);
    const diff = now.getTime() - completedTime.getTime();
    return diff > 24 * 60 * 60 * 1000;
  };

  const updateTask = (machineId: string, taskId: string, field: string, value: string | boolean) => {
    const machine = MACHINES.find(m => m.id === machineId);
    const max = machine?.totalSprings || 0;

    setMachineTasks(prev => ({
      ...prev,
      [machineId]: prev[machineId].map(task => {
        if (task.id !== taskId) return task;
        if (field === 'shadeId') {
          const selectedShade = shades.find(s => s.id === value);
          return { ...task, shadeId: value as string, shadeNumber: selectedShade?.shade_number || '', shadeSearchText: selectedShade?.shade_number || '', showShadeDropdown: false };
        }
        if (field === 'springs2ply' || field === 'springs3ply') {
          const numVal = parseInt(value as string) || 0;
          let error = '';

          if (numVal < 0) {
            error = 'Cannot be negative';
          } else if (numVal > max) {
            error = `Exceeds capacity (${max})`;
          }

          if (error) {
            return { ...task, [field]: value, error };
          }

          const otherField = field === 'springs2ply' ? 'springs3ply' : 'springs2ply';
          const otherVal = Math.max(0, max - numVal).toString();
          return { ...task, [field]: value, [otherField]: otherVal, error: '' };
        }
        return { ...task, [field]: value };
      })
    }));
  };

  const getFilteredShades = (text: string) => {
    if (!text || text.trim() === '') return shades;
    return shades.filter(s => s.shade_number.toString().toLowerCase().includes(text.toLowerCase()));
  };

  const addRow = () => {
    setMachineTasks(prev => {
      const next = { ...prev };
      MACHINES.forEach(m => {
        next[m.id] = [...next[m.id], emptyTask(m.id, next[m.id].length)];
      });
      return next;
    });
  };

  const deleteCell = (machineId: string, rowIndex: number) => {
    const doDelete = () => {
      setMachineTasks(prev => {
        const updated = { ...prev };
        updated[machineId] = prev[machineId].map((task, idx) => 
          idx === rowIndex ? emptyTask(machineId, rowIndex) : task
        );
        return updated;
      });
      if (activeTask?.machineId === machineId && activeTask?.taskId === `${machineId}-${rowIndex}`) {
        setActiveTask(null);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Are you sure you want to remove this task from ${machineId.toUpperCase()}?`);
      if (confirmed) doDelete();
    } else {
      Alert.alert('Remove Task', `Are you sure you want to remove this task from ${machineId.toUpperCase()}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const validateAndSave = async () => {
    setSaveError('');

    for (const machine of MACHINES) {
      const tasks = machineTasks[machine.id];
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (task.shadeId && (task.springs2ply || task.springs3ply)) {
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
      const tasks = machineTasks[machine.id].filter(t => t.shadeId !== '');
      if (tasks.length > 0) {
        payload[machine.id] = tasks.map(t => ({
          shade_id: t.shadeId, 
          shade_number: t.shadeNumber,
          springs_2ply: parseInt(t.springs2ply) || 0,
          springs_3ply: parseInt(t.springs3ply) || 0,
          weight: machine.capacity,
          completed_at: t.completed_at,
          carried_forward: t.carried_forward,
          original_date: t.original_date,
          // Preserve other fields if they were loaded
          status: t.status || 'pending',
          start_time: t.start_time,
          end_time: t.end_time,
          duration: t.duration,
        }));
        hasData = true;
      } else { payload[machine.id] = []; }
    }
    if (!hasData) {
      setSaveError('No tasks added');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks/${taskId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        if (Platform.OS === 'web') {
          alert('Updated successfully!');
          router.back();
        } else {
          Alert.alert('Success', 'Updated!', [{ text: 'OK', onPress: () => router.back() }]);
        }
      } else {
        const err = await response.json();
        setSaveError(`Update failed: ${err.detail || 'Unknown error'}`);
      }
    } catch (e) {
      setSaveError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Daily Task</Text>
          <View style={[styles.dateInputContainer, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
            <TextInput
              style={[styles.dateInput, { color: colors.primary }]}
              value={date}
              editable={false}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
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
              {Array.from({ length: maxRows }).map((_, rowIndex) => (
                <View key={rowIndex} style={[styles.gridRow, { zIndex: maxRows - rowIndex }]}>
                  <View style={styles.rowNumberCell}>
                    <Text style={[styles.rowNumberText, { color: colors.textSecondary }]}>{rowIndex + 1}</Text>
                  </View>
                  {MACHINES.map(machine => {
                    const task = machineTasks[machine.id][rowIndex];
                    const locked = task ? isTaskLocked(task.completed_at) : false;
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
                            <View style={styles.cellHeader}>
                              <TouchableOpacity
                                style={{ flex: 1, marginRight: 8 }}
                                onPress={() => {
                                  if (!locked) {
                                    setActiveTask(isActive ? null : { machineId: machine.id, taskId: task.id });
                                  }
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
                                {task.carried_forward && (
                                  <View style={{ backgroundColor: '#F59E0B', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, marginTop: 4, alignSelf: 'flex-start' }}>
                                    <Text style={{ fontSize: 9, color: '#FFFFFF', fontWeight: 'bold' }}>C/F</Text>
                                  </View>
                                )}
                              </TouchableOpacity>

                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                {locked && (
                                  <Text title="Locked (24h passed)" style={{ fontSize: 14 }}>🔒</Text>
                                )}
                                {!isActive && !locked && (
                                  <TouchableOpacity onPress={() => setActiveTask({ machineId: machine.id, taskId: task.id })}>
                                    <Text style={[styles.editIcon, { color: colors.textSecondary }]}>✎</Text>
                                  </TouchableOpacity>
                                )}
                                {!!task.shadeId && !isActive && !locked && (
                                  <TouchableOpacity onPress={() => deleteCell(machine.id, rowIndex)}>
                                    <Text style={{ fontSize: 14 }}>🗑️</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>

                            {isActive ? (
                              <View style={styles.inlineEditor}>
                                <View style={styles.inlineHeaderActions}>
                                  <TextInput
                                    style={[styles.inlineShadeInput, { color: colors.text, borderBottomColor: colors.primary, backgroundColor: 'transparent' }]}
                                    value={task.shadeSearchText}
                                    placeholder="Search shade..."
                                    placeholderTextColor={colors.textSecondary}
                                    onChangeText={v => {
                                      updateTask(machine.id, task.id, 'shadeSearchText', v);
                                      updateTask(machine.id, task.id, 'showShadeDropdown', true);
                                    }}
                                    onFocus={() => updateTask(machine.id, task.id, 'showShadeDropdown', true)}
                                    keyboardType="number-pad"
                                    autoFocus
                                    editable={!locked}
                                  />
                                  <TouchableOpacity
                                    onPress={() => setActiveTask(null)}
                                    style={styles.closeEditorBtn}
                                  >
                                    <Text style={{ color: colors.danger, fontWeight: 'bold', fontSize: 16 }}>✕</Text>
                                  </TouchableOpacity>
                                </View>

                                {task.showShadeDropdown && (
                                  <View style={[styles.inlineDropdown, { backgroundColor: colors.card, borderColor: colors.primary }]}>
                                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 200 }}>
                                      {getFilteredShades(task.shadeSearchText).map(s => (
                                        <TouchableOpacity
                                          key={s.id}
                                          style={[styles.inlineDropdownItem, { borderBottomColor: colors.border }]}
                                          onPress={() => updateTask(machine.id, task.id, 'shadeId', s.id)}
                                        >
                                          <Text style={[styles.inlineDropdownText, { color: colors.text }]}>#{s.shade_number}</Text>
                                        </TouchableOpacity>
                                      ))}
                                      {getFilteredShades(task.shadeSearchText).length === 0 && (
                                        <View style={[styles.inlineDropdownItem, { borderBottomColor: colors.border }]}>
                                          <Text style={[styles.inlineDropdownText, { color: colors.textSecondary }]}>No shades found</Text>
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
                                        { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground },
                                        hasError && { borderColor: '#ef4444', borderWidth: 1 },
                                      ]}
                                      value={task.springs2ply}
                                      onChangeText={v => updateTask(machine.id, task.id, 'springs2ply', v)}
                                      keyboardType="number-pad"
                                      placeholder="0"
                                      placeholderTextColor={colors.textSecondary}
                                      editable={!locked}
                                    />
                                  </View>
                                  <View style={styles.inlinePlyInputWrap}>
                                    <Text style={[styles.inlinePlyLabel, { color: colors.textSecondary }]}>3P</Text>
                                    <TextInput
                                      style={[
                                        styles.inlinePlyInput,
                                        { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground },
                                        hasError && { borderColor: '#ef4444', borderWidth: 1 },
                                      ]}
                                      value={task.springs3ply}
                                      onChangeText={v => updateTask(machine.id, task.id, 'springs3ply', v)}
                                      keyboardType="number-pad"
                                      placeholder="0"
                                      placeholderTextColor={colors.textSecondary}
                                      editable={!locked}
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
                                    <Text style={[styles.summaryPlyLabel, { color: colors.textSecondary }]}>2P</Text>
                                    <Text style={[styles.summaryPlyValue, { color: colors.text }]}>{task.springs2ply || 0}</Text>
                                  </View>
                                  <View style={styles.summaryPlyItem}>
                                    <Text style={[styles.summaryPlyLabel, { color: colors.textSecondary }]}>3P</Text>
                                    <Text style={[styles.summaryPlyValue, { color: colors.text }]}>{task.springs3ply || 0}</Text>
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
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ))}

              {/* Add Row Button */}
              <TouchableOpacity
                style={[styles.gridAddRowButton, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                onPress={addRow}
              >
                <Text style={[styles.gridAddRowText, { color: colors.primary }]}>+ Add Row</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </ScrollView>

        {saveError ? (
          <View style={styles.saveErrorContainer}>
            <Text style={styles.saveErrorText}>⚠ {saveError}</Text>
          </View>
        ) : null}

        <View style={[styles.footer, { backgroundColor: colors.headerBackground, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primary }, loading && styles.saveButtonDisabled]}
            onPress={validateAndSave}
            disabled={loading}
          >
            <Text style={styles.saveButtonText}>{loading ? 'Updating...' : '✓ Update Task'}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    paddingVertical: 4,
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
  dateInputContainer: {
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 12,
  },
  dateInput: {
    fontSize: 14,
    fontWeight: 'bold',
    paddingVertical: 6,
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
  saveButtonDisabled: {
    opacity: 0.5,
  },
});
