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
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { getBackendBaseUrl } from '../lib/api-base';

const EXPO_PUBLIC_BACKEND_URL = getBackendBaseUrl();

const MACHINES = [
  { id: 'm1', name: 'M1', capacity: 10.5, totalSprings: 7 },
  { id: 'm2', name: 'M2', capacity: 12, totalSprings: 8 },
  { id: 'm3', name: 'M3', capacity: 12, totalSprings: 9 },
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
}

export default function AddDailyTask() {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [shades, setShades] = useState<Shade[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Each machine has an array of tasks
  const [machineTasks, setMachineTasks] = useState<{ [key: string]: MachineTaskData[] }>({
    m1: [{ id: '1', shadeId: '', shadeNumber: '', springs2ply: '', springs3ply: '' }],
    m2: [{ id: '1', shadeId: '', shadeNumber: '', springs2ply: '', springs3ply: '' }],
    m3: [{ id: '1', shadeId: '', shadeNumber: '', springs2ply: '', springs3ply: '' }],
    m4: [{ id: '1', shadeId: '', shadeNumber: '', springs2ply: '', springs3ply: '' }],
    m5: [{ id: '1', shadeId: '', shadeNumber: '', springs2ply: '', springs3ply: '' }],
  });

  useEffect(() => {
    fetchShades();
  }, []);

  const fetchShades = async () => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/shades`);
      const data = await response.json();
      setShades(data);
    } catch (error) {
      console.error('Error fetching shades:', error);
    }
  };

  const addTaskToMachine = (machineId: string) => {
    const newTask: MachineTaskData = {
      id: Date.now().toString(),
      shadeId: '',
      shadeNumber: '',
      springs2ply: '',
      springs3ply: '',
    };
    setMachineTasks({
      ...machineTasks,
      [machineId]: [...machineTasks[machineId], newTask],
    });
  };

  const removeTaskFromMachine = (machineId: string, taskId: string) => {
    if (machineTasks[machineId].length > 1) {
      setMachineTasks({
        ...machineTasks,
        [machineId]: machineTasks[machineId].filter((task) => task.id !== taskId),
      });
    }
  };

  const updateTask = (machineId: string, taskId: string, field: string, value: string) => {
    if (field === 'shadeId') {
      const selectedShade = shades.find((s) => s.id === value);
      setMachineTasks({
        ...machineTasks,
        [machineId]: machineTasks[machineId].map((task) =>
          task.id === taskId
            ? { ...task, shadeId: value, shadeNumber: selectedShade?.shade_number || '' }
            : task
        ),
      });
    } else {
      setMachineTasks({
        ...machineTasks,
        [machineId]: machineTasks[machineId].map((task) =>
          task.id === taskId ? { ...task, [field]: value } : task
        ),
      });
    }
  };

  // Helper function for showing alerts (web compatible)
  const showAlert = (title: string, message: string, onOk?: () => void) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
      if (onOk) onOk();
    } else {
      Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
    }
  };

  const validateAndSave = async () => {
    if (!date) {
      showAlert('Error', 'Please select a date');
      return;
    }

    const payload: any = { date };
    let hasData = false;

    for (const machine of MACHINES) {
      const tasks = machineTasks[machine.id];
      const validTasks = [];

      for (const task of tasks) {
        if (task.shadeId && (task.springs2ply || task.springs3ply)) {
          const ply2 = parseInt(task.springs2ply) || 0;
          const ply3 = parseInt(task.springs3ply) || 0;

          validTasks.push({
            shade_id: task.shadeId,
            shade_number: task.shadeNumber,
            springs_2ply: ply2,
            springs_3ply: ply3,
            weight: machine.capacity,
          });
        }
      }

      // Check total springs don't exceed machine capacity
      const totalSprings = validTasks.reduce((sum, t) => sum + t.springs_2ply + t.springs_3ply, 0);
      if (totalSprings > machine.totalSprings) {
        showAlert('Error', `${machine.name}: Total springs (${totalSprings}) exceeds capacity (${machine.totalSprings})`);
        return;
      }

      if (validTasks.length > 0) {
        payload[machine.id] = validTasks;
        hasData = true;
      }
    }

    if (!hasData) {
      showAlert('Error', 'Please add at least one task');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/daily-tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        showAlert('Success', 'Daily task added successfully', () => router.back());
      } else {
        const error = await response.json();
        showAlert('Error', error.detail || 'Failed to add task');
      }
    } catch (error) {
      console.error('Error adding task:', error);
      showAlert('Error', 'Failed to add task');
    } finally {
      setLoading(false);
    }
  };

  const renderMachineForm = (machine: typeof MACHINES[0]) => {
    const tasks = machineTasks[machine.id];
    const totalSprings = tasks.reduce(
      (sum, task) => sum + (parseInt(task.springs2ply) || 0) + (parseInt(task.springs3ply) || 0),
      0
    );
    const isOverCapacity = totalSprings > machine.totalSprings;

    return (
      <View key={machine.id} style={styles.machineCard}>
        <View style={styles.machineHeader}>
          <Text style={styles.machineName}>{machine.name}</Text>
          <Text style={styles.machineCapacity}>
            {machine.capacity}kg • {machine.totalSprings} springs
          </Text>
        </View>

        {tasks.map((task, taskIndex) => (
          <View key={task.id} style={styles.taskContainer}>
            <View style={styles.taskHeader}>
              <Text style={styles.taskTitle}>Task {taskIndex + 1}</Text>
              {tasks.length > 1 && (
                <TouchableOpacity
                  style={styles.removeTaskButton}
                  onPress={() => removeTaskFromMachine(machine.id, task.id)}
                >
                  <Text style={styles.removeTaskText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Select Shade</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={task.shadeId}
                  onValueChange={(value) => updateTask(machine.id, task.id, 'shadeId', value)}
                  style={styles.picker}
                  dropdownIconColor="#fff"
                >
                  <Picker.Item label="-- Select Shade --" value="" />
                  {shades.map((shade) => (
                    <Picker.Item
                      key={shade.id}
                      label={`Shade #${shade.shade_number}`}
                      value={shade.id}
                    />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={styles.springRow}>
              <View style={styles.springInput}>
                <Text style={styles.label}>2 PLY</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#666"
                  keyboardType="number-pad"
                  value={task.springs2ply}
                  onChangeText={(value) => updateTask(machine.id, task.id, 'springs2ply', value)}
                />
              </View>

              <View style={styles.springInput}>
                <Text style={styles.label}>3 PLY</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#666"
                  keyboardType="number-pad"
                  value={task.springs3ply}
                  onChangeText={(value) => updateTask(machine.id, task.id, 'springs3ply', value)}
                />
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={styles.addTaskButton}
          onPress={() => addTaskToMachine(machine.id)}
        >
          <Text style={styles.addTaskButtonText}>+ Add Task</Text>
        </TouchableOpacity>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Springs Used:</Text>
          <Text style={[styles.totalValue, isOverCapacity && styles.errorText]}>
            {totalSprings} / {machine.totalSprings}
          </Text>
        </View>
        {isOverCapacity && (
          <Text style={styles.errorMessage}>⚠️ Exceeds machine capacity!</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Daily Task</Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#666"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Machine Tasks</Text>
            {MACHINES.map((machine) => renderMachineForm(machine))}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={validateAndSave}
            disabled={loading}
          >
            <Text style={styles.saveButtonText}>
              {loading ? 'Saving...' : 'Save Daily Task'}
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
    backgroundColor: '#0f0f1e',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    backgroundColor: '#1a1a2e',
    padding: 16,
    paddingTop: 8,
  },
  backButton: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  backButtonText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  machineCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  machineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  machineName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  machineCapacity: {
    fontSize: 12,
    color: '#888',
  },
  taskContainer: {
    backgroundColor: '#0f0f1e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9800',
  },
  removeTaskButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f44336',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeTaskText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  addTaskButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  addTaskButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 8,
    fontWeight: '500',
  },
  pickerContainer: {
    backgroundColor: '#0f0f1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  picker: {
    color: '#fff',
    backgroundColor: '#0f0f1e',
  },
  input: {
    backgroundColor: '#0f0f1e',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  springRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  springInput: {
    flex: 1,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  totalLabel: {
    fontSize: 14,
    color: '#aaa',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  errorText: {
    color: '#f44336',
  },
  errorMessage: {
    fontSize: 12,
    color: '#f44336',
    marginTop: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a2e',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
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
});
