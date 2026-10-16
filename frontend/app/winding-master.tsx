import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { getBackendBaseUrl } from '../lib/api-base';

const EXPO_PUBLIC_BACKEND_URL = getBackendBaseUrl();

interface ShadeItem {
  id: string;
  shade_number: string;
  springs: number;
}

interface HeadData {
  head_number: number;
  items: ShadeItem[];
}

interface WindingTask {
  id: string;
  date: string;
  machine_id: string;
  operator_name: string;
  quality_name: string;
  status: 'pending' | 'in_progress' | 'completed';
  start_time?: string | null;
  end_time?: string | null;
  sections?: any[];
  total_springs: number;
  total_kg: number;
  total_wages: number;
  parchi_image_url?: string;
  notes?: string;
  is_extra_m2?: boolean;
  allocated_items?: Record<string, number>;
  created_at?: string;
}

const ALL_SHADES_LIST = Array.from({ length: 460 }, (_, i) => String(i + 1));

const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Robust image URL resolver for Cloudinary, MongoDB endpoints, and base64 data URIs
const resolveImageUrl = (url?: string | null): string => {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const base = EXPO_PUBLIC_BACKEND_URL || '';
  if (trimmed.startsWith('/')) {
    return `${base}${trimmed}`;
  }
  return `${base}/${trimmed}`;
};

// Client-side image compression: downsizes large camera photos to ~150KB to prevent Vercel 4.5MB HTTP 413 limits
const compressImage = (dataUrl: string, maxWidth = 1200, quality = 0.75): Promise<string> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return resolve(dataUrl);
    }
    try {
      const img = new (window as any).Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(dataUrl);
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
};

// Extract list of shades and springs worked on from task sections or allocated_items
const extractShadesFromTask = (t: WindingTask): { shade: string; springs: number; sectionName?: string }[] => {
  const result: { shade: string; springs: number; sectionName?: string }[] = [];
  const shadeMap = new Map<string, { springs: number; sections: Set<string> }>();

  // 1. Check sections (M1 k800/dolly_gold or M2/M3/M4 zip135 heads)
  if (Array.isArray(t.sections) && t.sections.length > 0) {
    t.sections.forEach((sec: any) => {
      const secTitle = sec.title || (sec.section_id === 'k800' ? 'K800' : sec.section_id === 'dolly_gold' ? 'Dolly Gold' : 'Zip 135');
      if (Array.isArray(sec.items)) {
        sec.items.forEach((it: any) => {
          const sn = String(it.shade_number || '').trim().replace(/^#/, '');
          const sp = Number(it.springs) || 0;
          if (sn && sp > 0) {
            const existing = shadeMap.get(sn) || { springs: 0, sections: new Set<string>() };
            existing.springs += sp;
            existing.sections.add(secTitle);
            shadeMap.set(sn, existing);
          }
        });
      }
      if (Array.isArray(sec.heads)) {
        sec.heads.forEach((h: any) => {
          const headLabel = `Head ${h.head_number}`;
          if (Array.isArray(h.items)) {
            h.items.forEach((it: any) => {
              const sn = String(it.shade_number || '').trim().replace(/^#/, '');
              const sp = Number(it.springs) || 0;
              if (sn && sp > 0) {
                const existing = shadeMap.get(sn) || { springs: 0, sections: new Set<string>() };
                existing.springs += sp;
                existing.sections.add(headLabel);
                shadeMap.set(sn, existing);
              }
            });
          }
        });
      }
    });
  }

  // 2. Check allocated_items fallback
  if (shadeMap.size === 0 && t.allocated_items && typeof t.allocated_items === 'object') {
    Object.entries(t.allocated_items).forEach(([snRaw, spRaw]) => {
      const sn = String(snRaw).trim().replace(/^#/, '');
      const sp = Number(spRaw) || 0;
      if (sn && sp > 0) {
        shadeMap.set(sn, { springs: sp, sections: new Set<string>() });
      }
    });
  }

  shadeMap.forEach((val, sn) => {
    const secArr = Array.from(val.sections);
    result.push({
      shade: sn,
      springs: val.springs,
      sectionName: secArr.length > 0 ? secArr.join(', ') : undefined,
    });
  });

  result.sort((a, b) => {
    const numA = parseInt(a.shade, 10);
    const numB = parseInt(b.shade, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.shade.localeCompare(b.shade);
  });

  return result;
};

export default function WindingMaster() {
  const router = useRouter();
  const { colors } = useTheme();

  // User Auth State
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);

  // Mode: 'worker' (Operator entry) vs 'register' (Master Daily Register view)
  const [activeTab, setActiveTab] = useState<'worker' | 'register'>('register');

  // Selected Machine & Date
  const [selectedMachine, setSelectedMachine] = useState<'M1' | 'M2' | 'M3' | 'M4'>('M1');
  const [taskDate, setTaskDate] = useState<string>(getTodayDateString);
  const [operatorName, setOperatorName] = useState<string>('Phool');

  // Shade Picker Dropdown & Range Modal State
  const [shadePickerVisible, setShadePickerVisible] = useState<boolean>(false);
  const [shadeTarget, setShadeTarget] = useState<{
    section: 'k800' | 'dolly' | 'head';
    rowIdx: number;
    headIdx?: number;
  } | null>(null);
  const [shadeSearch, setShadeSearch] = useState<string>('');
  const [rangeTab, setRangeTab] = useState<'all' | '1-100' | '101-200' | '201-300' | '301-400' | '401-460'>('all');
  const [multiSelectMode, setMultiSelectMode] = useState<boolean>(false);
  const [selectedShadesList, setSelectedShadesList] = useState<string[]>([]);

  // Active In-Progress Task ID (persisted in DB)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Live Available Stock Map from Stock In Hand
  const [stockMap, setStockMap] = useState<{
    [shade: string]: { springs_2ply: number; springs_3ply: number; available: number };
  }>({});
  const [loadingStock, setLoadingStock] = useState<boolean>(false);
  const [inStockOnlyFilter, setInStockOnlyFilter] = useState<boolean>(false);

  // M1 Operator Running M2 as well toggle
  const [isExtraM2, setIsExtraM2] = useState<boolean>(false);

  // Task Status & Timers
  const [taskStatus, setTaskStatus] = useState<'pending' | 'in_progress' | 'completed'>('pending');
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);

  // M1 State
  const [m1K800Items, setM1K800Items] = useState<ShadeItem[]>([
    { id: '1', shade_number: '', springs: 0 },
  ]);
  const [m1DollyTarget, setM1DollyTarget] = useState<8 | 10>(8);
  const [m1DollyItems, setM1DollyItems] = useState<ShadeItem[]>([
    { id: '1', shade_number: '', springs: 0 },
  ]);

  // M2 / M3 / M4 State (4 heads, each up to 4 springs)
  const [m2Heads, setM2Heads] = useState<HeadData[]>([
    { head_number: 1, items: [{ id: '1-1', shade_number: '', springs: 0 }] },
    { head_number: 2, items: [{ id: '2-1', shade_number: '', springs: 0 }] },
    { head_number: 3, items: [{ id: '3-1', shade_number: '', springs: 0 }] },
    { head_number: 4, items: [{ id: '4-1', shade_number: '', springs: 0 }] },
  ]);

  // Parchi Photo State
  const [parchiBase64, setParchiBase64] = useState<string | null>(null);
  const [parchiImageUrl, setParchiImageUrl] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);

  // Register View Data
  const [tasksList, setTasksList] = useState<WindingTask[]>([]);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loadingTasks, setLoadingTasks] = useState<boolean>(false);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<string | null>(null);

  // Hidden File input ref for Web / Mobile Browser camera
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const taskFileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingForTaskId, setUploadingForTaskId] = useState<string | null>(null);

  // Load authenticated user profile
  useEffect(() => {
    const loadAuth = async () => {
      try {
        const role = await AsyncStorage.getItem('userRole');
        const name = await AsyncStorage.getItem('userName');
        const machine = await AsyncStorage.getItem('assignedMachine');
        setUserRole(role);
        if (name) setLoggedInUser(name);
        if (role === 'winding_operator') {
          setActiveTab('worker');
          // Strict 1-worker to 1-machine lock
          // phool -> M1, rajeev -> M2, operator3 -> M3, operator4 -> M4
          let lockedMachine: 'M1' | 'M2' | 'M3' | 'M4' = 'M1';
          let lockedName = name || 'Phool';
          const lowerName = (name || '').toLowerCase();
          if (lowerName.includes('phool')) {
            lockedMachine = 'M1';
            lockedName = 'Phool';
          } else if (lowerName.includes('rajeev')) {
            lockedMachine = 'M2';
            lockedName = 'Rajeev';
          } else if (lowerName.includes('3')) {
            lockedMachine = 'M3';
            lockedName = 'Operator 3';
          } else if (lowerName.includes('4')) {
            lockedMachine = 'M4';
            lockedName = 'Operator 4';
          } else if (machine && ['M1', 'M2', 'M3', 'M4'].includes(machine)) {
            lockedMachine = machine as any;
          }
          setSelectedMachine(lockedMachine);
          setOperatorName(lockedName);
        } else {
          // Admin & non-operator: only see Master Daily Register
          setActiveTab('register');
        }
      } catch (e) {
        console.log('Error loading auth in winding-master', e);
      }
    };
    loadAuth();
  }, []);

  // Set default operator name when machine changes (if not fixed by login)
  useEffect(() => {
    if (userRole === 'winding_operator' && loggedInUser) {
      setOperatorName(loggedInUser);
    } else {
      if (selectedMachine === 'M1') {
        setOperatorName('Phool');
      } else if (selectedMachine === 'M2') {
        setOperatorName('Rajeev');
      } else if (selectedMachine === 'M3') {
        setOperatorName('Operator 3');
      } else if (selectedMachine === 'M4') {
        setOperatorName('Operator 4');
      }
    }
  }, [selectedMachine, userRole, loggedInUser]);

  // Logout handler
  const handleLogout = async () => {
    const performLogout = async () => {
      await AsyncStorage.removeItem('isAuthenticated');
      await AsyncStorage.removeItem('userRole');
      await AsyncStorage.removeItem('userName');
      await AsyncStorage.removeItem('assignedMachine');
      if (Platform.OS === 'web') {
        window.location.href = '/login';
      } else {
        router.replace('/login');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to logout? (क्या आप लॉगआउट करना चाहते हैं?)');
      if (confirmed) performLogout();
      return;
    }

    Alert.alert('Logout', 'Are you sure you want to logout? (क्या आप लॉगआउट करना चाहते हैं?)', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: performLogout },
    ]);
  };

  const isMasterUser = userRole === 'user' || userRole === 'user1' || userRole === 'user2';

  const handleBack = () => {
    if (isMasterUser) {
      router.replace('/dyeing-master');
    } else if (userRole === 'admin') {
      router.replace('/');
    } else {
      router.back();
    }
  };

  const currentPly = selectedMachine === 'M1' ? '2-ply' : '3-ply';

  // Fetch available stock for current machine
  const fetchAvailableStock = async () => {
    try {
      setLoadingStock(true);
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/winding/available-stock?machine_id=${selectedMachine}`);
      if (res.ok) {
        const data = await res.json();
        setStockMap(data.shades || {});
      }
    } catch (e) {
      console.error('Error fetching available stock:', e);
    } finally {
      setLoadingStock(false);
    }
  };

  // Fetch active in-progress task for current operator & machine
  const fetchActiveTask = async () => {
    try {
      const url = `${EXPO_PUBLIC_BACKEND_URL}/api/winding/active-task?machine_id=${selectedMachine}&operator_name=${encodeURIComponent(operatorName)}&date=${taskDate}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.active_task) {
          const t = data.active_task;
          setActiveTaskId(t.id);
          setTaskStatus('in_progress');
          setStartTime(t.start_time || null);
          if (t.parchi_image_url) setParchiImageUrl(t.parchi_image_url);
          if (t.is_extra_m2 !== undefined) setIsExtraM2(t.is_extra_m2);

          // Restore sections
          if (selectedMachine === 'M1') {
            const k800Sec = (t.sections || []).find((s: any) => s.section_id === 'k800');
            const dollySec = (t.sections || []).find((s: any) => s.section_id === 'dolly_gold');
            if (k800Sec && k800Sec.items && k800Sec.items.length > 0) {
              setM1K800Items(k800Sec.items);
            }
            if (dollySec) {
              if (dollySec.target_springs) setM1DollyTarget(dollySec.target_springs);
              if (dollySec.items && dollySec.items.length > 0) {
                setM1DollyItems(dollySec.items);
              }
            }
          } else {
            const zipSec = (t.sections || []).find((s: any) => s.section_id === 'zip135');
            if (zipSec && zipSec.heads && zipSec.heads.length > 0) {
              setM2Heads(zipSec.heads);
            }
          }
        } else {
          setActiveTaskId(null);
          setTaskStatus('pending');
          setStartTime(null);
          setEndTime(null);
        }
      }
    } catch (e) {
      console.error('Error fetching active task:', e);
    }
  };

  // Trigger stock & active task check on machine/operator/date changes
  useEffect(() => {
    if (userRole === 'winding_operator') {
      fetchAvailableStock();
      fetchActiveTask();
    }
  }, [selectedMachine, operatorName, taskDate, userRole]);

  // Sync modifications while task is in-progress
  const syncTaskInProgress = async (customSections?: any[]) => {
    if (taskStatus !== 'in_progress' || !activeTaskId) return;

    let sectionsPayload = customSections;
    if (!sectionsPayload) {
      if (selectedMachine === 'M1') {
        sectionsPayload = [
          {
            section_id: 'k800',
            title: 'Kohinoor 800 mtr (K800)',
            target_springs: 36,
            rate_per_kg: 12.0,
            weight_per_spring: 1.5,
            items: m1K800Items.filter((i) => i.shade_number && i.springs > 0),
            total_springs: m1K800Springs,
            total_kg: m1K800Kg,
            total_wages: m1K800Wages,
          },
          {
            section_id: 'dolly_gold',
            title: 'Dolly Gold',
            target_springs: m1DollyTarget,
            rate_per_kg: 4.5,
            weight_per_spring: 1.5,
            items: m1DollyItems.filter((i) => i.shade_number && i.springs > 0),
            total_springs: m1DollySprings,
            total_kg: m1DollyKg,
            total_wages: m1DollyWages,
          },
        ];
      } else {
        sectionsPayload = [
          {
            section_id: 'zip135',
            title: 'Zip 135 mtr',
            target_springs: 16,
            rate_per_kg: 40.0,
            weight_per_spring: 1.5,
            heads: m2Heads,
            total_springs: m2TotalSprings,
            total_kg: m2TotalKg,
            total_wages: m2TotalWages,
          },
        ];
      }
    }

    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/winding/tasks/${activeTaskId}/sync-in-progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: sectionsPayload,
          total_springs: currentTotalSprings,
          total_kg: currentTotalKg,
          total_wages: currentTotalWages,
        }),
      });
      if (res.ok) {
        fetchAvailableStock();
      } else {
        const errData = await res.json().catch(() => ({}));
        Alert.alert('Stock Sync Warning', errData.detail || 'Could not update stock.');
        fetchAvailableStock();
      }
    } catch (e) {
      console.error('Error syncing task in progress:', e);
    }
  };

  // Open shade picker modal
  const openShadePicker = (section: 'k800' | 'dolly' | 'head', rowIdx: number, headIdx?: number) => {
    fetchAvailableStock();
    setShadeTarget({ section, rowIdx, headIdx });
    setShadeSearch('');
    setRangeTab('all');
    setMultiSelectMode(false);
    setSelectedShadesList([]);
    setShadePickerVisible(true);
  };

  // Toggle multi-select shade
  const toggleMultiShade = (shadeNum: string) => {
    const cleanSn = shadeNum.replace(/^#/, '');
    if (selectedShadesList.includes(cleanSn)) {
      setSelectedShadesList(selectedShadesList.filter((s) => s !== cleanSn));
    } else {
      const avail = stockMap[cleanSn]?.available ?? 0;
      if (avail <= 0) {
        Alert.alert(
          'Out of Stock',
          `Shade #${cleanSn} has 0 springs available in ${currentPly} stock! (स्टॉक में उपलब्ध नहीं है)`
        );
        return;
      }
      setSelectedShadesList([...selectedShadesList, cleanSn]);
    }
  };

  // Apply multi-selected shades to target section / head
  const handleApplyMultiShades = () => {
    if (!shadeTarget || selectedShadesList.length === 0) {
      setShadePickerVisible(false);
      return;
    }

    if (shadeTarget.section === 'head' && shadeTarget.headIdx !== undefined) {
      const hIdx = shadeTarget.headIdx;
      const updated = [...m2Heads];
      const n = selectedShadesList.length;
      const perSpring = Math.max(1, Math.floor(4 / n));

      const newItems: ShadeItem[] = selectedShadesList.map((sn, idx) => {
        let springs = perSpring;
        if (idx === n - 1 && n <= 4) {
          springs = 4 - perSpring * (n - 1);
        }
        const avail = stockMap[sn]?.available ?? 4;
        const clamped = Math.min(springs > 0 ? springs : 1, Math.max(1, avail));
        return {
          id: `${Date.now()}-${idx}`,
          shade_number: sn,
          springs: clamped,
        };
      });

      updated[hIdx].items = newItems;
      setM2Heads(updated);
      if (taskStatus === 'in_progress') syncTaskInProgress();
    } else if (shadeTarget.section === 'k800') {
      const updated = [...m1K800Items];
      selectedShadesList.forEach((sn, idx) => {
        if (idx === 0) {
          updated[shadeTarget.rowIdx].shade_number = sn;
        } else {
          updated.push({
            id: `${Date.now()}-${idx}`,
            shade_number: sn,
            springs: 0,
          });
        }
      });
      setM1K800Items(updated);
      if (taskStatus === 'in_progress') syncTaskInProgress();
    } else if (shadeTarget.section === 'dolly') {
      const updated = [...m1DollyItems];
      selectedShadesList.forEach((sn, idx) => {
        if (idx === 0) {
          updated[shadeTarget.rowIdx].shade_number = sn;
        } else {
          updated.push({
            id: `${Date.now()}-${idx}`,
            shade_number: sn,
            springs: 0,
          });
        }
      });
      setM1DollyItems(updated);
      if (taskStatus === 'in_progress') syncTaskInProgress();
    }

    setShadePickerVisible(false);
    setShadeTarget(null);
    setSelectedShadesList([]);
    setMultiSelectMode(false);
  };

  // Handle selecting a single shade from dropdown modal
  const handleSelectShade = (shadeNum: string) => {
    if (!shadeTarget) return;
    const cleanSn = shadeNum.replace(/^#/, '');
    const avail = stockMap[cleanSn]?.available ?? 0;
    if (avail <= 0) {
      Alert.alert(
        'Out of Stock (स्टॉक नहीं है)',
        `Shade #${cleanSn} does not have any springs available in ${currentPly} stock! (स्टॉक में 0 स्प्रिंग्स हैं)`
      );
      return;
    }

    if (shadeTarget.section === 'k800') {
      const updated = [...m1K800Items];
      updated[shadeTarget.rowIdx].shade_number = cleanSn;
      setM1K800Items(updated);
      if (taskStatus === 'in_progress') syncTaskInProgress();
    } else if (shadeTarget.section === 'dolly') {
      const updated = [...m1DollyItems];
      updated[shadeTarget.rowIdx].shade_number = cleanSn;
      setM1DollyItems(updated);
      if (taskStatus === 'in_progress') syncTaskInProgress();
    } else if (shadeTarget.section === 'head' && shadeTarget.headIdx !== undefined) {
      const updated = [...m2Heads];
      updated[shadeTarget.headIdx].items[shadeTarget.rowIdx].shade_number = cleanSn;
      setM2Heads(updated);
      if (taskStatus === 'in_progress') syncTaskInProgress();
    }
    setShadePickerVisible(false);
    setShadeTarget(null);
  };

  // Filter shades #1 to #460 based on search query, range tab, and in-stock toggle
  const filteredShades = useMemo(() => {
    return ALL_SHADES_LIST.filter((sn) => {
      const avail = stockMap[sn]?.available ?? 0;
      if (inStockOnlyFilter && avail <= 0) return false;

      const num = parseInt(sn, 10);
      if (rangeTab === '1-100' && (num < 1 || num > 100)) return false;
      if (rangeTab === '101-200' && (num < 101 || num > 200)) return false;
      if (rangeTab === '201-300' && (num < 201 || num > 300)) return false;
      if (rangeTab === '301-400' && (num < 301 || num > 400)) return false;
      if (rangeTab === '401-460' && (num < 401 || num > 460)) return false;

      if (shadeSearch.trim()) {
        const q = shadeSearch.trim().replace(/^#/, '');
        return sn.includes(q);
      }
      return true;
    });
  }, [stockMap, inStockOnlyFilter, rangeTab, shadeSearch]);

  const inStockCount = useMemo(() => {
    let count = 0;
    for (const sn of ALL_SHADES_LIST) {
      if ((stockMap[sn]?.available ?? 0) > 0) count++;
    }
    return count;
  }, [stockMap]);

  // Load existing tasks on mount or date change
  useEffect(() => {
    fetchTasks();
  }, [taskDate, userRole]);

  const fetchTasks = async () => {
    try {
      setLoadingTasks(true);
      const url = `${EXPO_PUBLIC_BACKEND_URL}/api/winding/daily-summary?date=${taskDate}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data);
        setTasksList(data.tasks || []);
      }
    } catch (e) {
      console.error('Error fetching winding tasks:', e);
    } finally {
      setLoadingTasks(false);
    }
  };

  // Filter individual operator tasks (strictly Phool sees Phool, Rajeev sees Rajeev, etc.)
  const operatorTasks = useMemo(() => {
    return tasksList.filter((t) => {
      const tOp = (t.operator_name || '').trim().toLowerCase();
      const currOp = (operatorName || '').trim().toLowerCase();
      const tMach = (t.machine_id || '').trim().toUpperCase();
      const currMach = (selectedMachine || '').trim().toUpperCase();
      return tOp === currOp || tMach === currMach;
    });
  }, [tasksList, operatorName, selectedMachine]);

  // Helper calculations for M1
  const m1K800Springs = m1K800Items.reduce((acc, curr) => acc + (Number(curr.springs) || 0), 0);
  const m1K800Kg = m1K800Springs * 1.5;
  const m1K800Wages = m1K800Kg * 12.0;

  const m1DollySprings = m1DollyItems.reduce((acc, curr) => acc + (Number(curr.springs) || 0), 0);
  const m1DollyKg = m1DollySprings * 1.5;
  const m1DollyWages = m1DollyKg * 4.5;

  const m1TotalSprings = m1K800Springs + m1DollySprings;
  const m1TotalKg = m1K800Kg + m1DollyKg;
  const m1TotalWages = m1K800Wages + m1DollyWages;

  // Helper calculations for M2, M3, M4
  const m2TotalSprings = m2Heads.reduce(
    (hAcc, head) => hAcc + head.items.reduce((iAcc, item) => iAcc + (Number(item.springs) || 0), 0),
    0
  );
  const m2TotalKg = m2TotalSprings * 1.5;
  const m2TotalWages = m2TotalKg * 40.0;

  // Active Machine Form Totals
  const currentTotalSprings = selectedMachine === 'M1' ? m1TotalSprings : m2TotalSprings;
  const currentTotalKg = selectedMachine === 'M1' ? m1TotalKg : m2TotalKg;
  const currentTotalWages = selectedMachine === 'M1' ? m1TotalWages : m2TotalWages;

  // Operator's total production & wages for today across all their recorded & active tasks
  const operatorDayTotals = useMemo(() => {
    let totalSprings = 0;
    let totalKg = 0;
    let totalWages = 0;

    let hasActiveInTasks = false;
    (operatorTasks || []).forEach((t) => {
      if (activeTaskId && t.id === activeTaskId) {
        hasActiveInTasks = true;
        totalSprings += currentTotalSprings;
        totalKg += currentTotalKg;
        totalWages += currentTotalWages;
      } else {
        totalSprings += Number(t.total_springs) || 0;
        totalKg += Number(t.total_kg) || 0;
        totalWages += Number(t.total_wages) || 0;
      }
    });

    if (activeTaskId && !hasActiveInTasks && taskStatus === 'in_progress') {
      totalSprings += currentTotalSprings;
      totalKg += currentTotalKg;
      totalWages += currentTotalWages;
    }

    return {
      totalSprings,
      totalKg,
      totalWages,
    };
  }, [operatorTasks, activeTaskId, taskStatus, currentTotalSprings, currentTotalKg, currentTotalWages]);

  // Photo Upload Handler (HTML5 / Mobile Camera & Gallery)
  const handlePhotoSelect = (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawB64 = event.target?.result as string;
      const b64 = await compressImage(rawB64, 1200, 0.75);
      setParchiBase64(b64);
      // Auto-upload to backend / Cloudinary
      await uploadParchiPhoto(b64);
    };
    reader.readAsDataURL(file);
  };

  const uploadParchiPhoto = async (base64String: string) => {
    try {
      setUploadingImage(true);
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/winding/upload-parchi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64String,
          filename: `parchi_${selectedMachine}_${taskDate}.jpg`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const url = data.url || base64String;
        setParchiImageUrl(url);
        // If task is in progress, sync immediately
        if (activeTaskId) {
          fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/winding/tasks/${activeTaskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parchi_image_url: url }),
          }).catch((err) => console.error('Failed to sync parchi to active task:', err));
        }
      } else {
        // Fallback to compressed base64 so it is never lost
        setParchiImageUrl(base64String);
      }
    } catch (e) {
      console.error('Error uploading photo:', e);
      setParchiImageUrl(base64String);
    } finally {
      setUploadingImage(false);
    }
  };

  // Upload or replace parchi on any existing recorded task (Admin or Operator)
  const triggerTaskPhotoUpload = (taskId: string) => {
    setUploadingForTaskId(taskId);
    if (Platform.OS === 'web' && taskFileInputRef.current) {
      taskFileInputRef.current.value = '';
      taskFileInputRef.current.click();
    }
  };

  const handleTaskPhotoSelect = async (e: any) => {
    const file = e.target?.files?.[0];
    const targetTaskId = uploadingForTaskId;
    if (!file || !targetTaskId) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setLoadingTasks(true);
        const rawB64 = event.target?.result as string;
        const b64 = await compressImage(rawB64, 1200, 0.75);

        let imgUrl = b64;
        try {
          const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/winding/upload-parchi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image_base64: b64,
              filename: `parchi_task_${targetTaskId}.jpg`,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.url) imgUrl = data.url;
          }
        } catch (uploadErr) {
          console.warn('Backend upload-parchi failed, using compressed base64 fallback:', uploadErr);
        }

        const patchRes = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/winding/tasks/${targetTaskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parchi_image_url: imgUrl }),
        });

        if (patchRes.ok) {
          Alert.alert('✅ Parchi Attached', 'Parchi photo successfully uploaded and linked to this task!');
          await fetchTasks();
        } else {
          Alert.alert('Error', 'Failed to update task with parchi photo.');
        }
      } catch (err) {
        console.error('Error attaching photo:', err);
        Alert.alert('Error', 'Could not process photo.');
      } finally {
        setLoadingTasks(false);
        setUploadingForTaskId(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Start Task Handler
  const handleStartTask = async () => {
    // Validate at least one shade with springs > 0
    const hasValidItems =
      selectedMachine === 'M1'
        ? m1K800Items.some((i) => i.shade_number && i.springs > 0) ||
          m1DollyItems.some((i) => i.shade_number && i.springs > 0)
        : m2Heads.some((h) => h.items.some((i) => i.shade_number && i.springs > 0));

    if (!hasValidItems) {
      Alert.alert('Selection Required', 'कृपया टास्क शुरू करने से पहले कम से कम एक शेड नंबर और स्प्रिंग भरें!');
      return;
    }

    // 1. Validate Task Parchi Photo is compulsory
    if (!parchiImageUrl && !parchiBase64) {
      Alert.alert(
        '📷 Task Parchi Photo Compulsory (पर्ची की फोटो अनिवार्य है)',
        'टास्क शुरू करने से पहले पर्ची की फोटो खींचें या अपलोड करें! पर्ची की फोटो अनिवार्य (compulsory) है।'
      );
      return;
    }

    // 2. Validate Per Head Limit for M2, M3, M4 (max 4 per head)
    if (selectedMachine !== 'M1') {
      for (const h of m2Heads) {
        const headSum = h.items.reduce((s, it) => s + (Number(it.springs) || 0), 0);
        if (headSum > 4) {
          const hTitle = h.head_number === 1 ? '1st' : h.head_number === 2 ? '2nd' : h.head_number === 3 ? '3rd' : '4th';
          Alert.alert(
            'Per Head Limit (अधिकतम 4 स्प्रिंग)',
            `${hTitle} Head mein 4 se jyada springs nahi ho sakti! (Currently: ${headSum} Springs)`
          );
          return;
        }
      }
    }

    // Validate available stock for each shade
    const itemsToCheck: { sn: string; springs: number }[] = [];
    if (selectedMachine === 'M1') {
      m1K800Items.forEach((i) => {
        if (i.shade_number && i.springs > 0) itemsToCheck.push({ sn: i.shade_number.replace(/^#/, ''), springs: Number(i.springs) });
      });
      m1DollyItems.forEach((i) => {
        if (i.shade_number && i.springs > 0) itemsToCheck.push({ sn: i.shade_number.replace(/^#/, ''), springs: Number(i.springs) });
      });
    } else {
      m2Heads.forEach((h) => {
        h.items.forEach((i) => {
          if (i.shade_number && i.springs > 0) itemsToCheck.push({ sn: i.shade_number.replace(/^#/, ''), springs: Number(i.springs) });
        });
      });
    }

    const sumMap: { [sn: string]: number } = {};
    for (const it of itemsToCheck) {
      sumMap[it.sn] = (sumMap[it.sn] || 0) + it.springs;
    }

    for (const sn of Object.keys(sumMap)) {
      const needed = sumMap[sn];
      const avail = stockMap[sn]?.available ?? 0;
      if (needed > avail) {
        Alert.alert(
          'Insufficient Stock (स्टॉक कम है)',
          `Shade #${sn} ke liye sirf ${avail} springs available hain (${currentPly}), par aapne ${needed} dali hain!`
        );
        return;
      }
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let sectionsPayload: any[] = [];
    if (selectedMachine === 'M1') {
      sectionsPayload = [
        {
          section_id: 'k800',
          title: 'Kohinoor 800 mtr (K800)',
          target_springs: 36,
          rate_per_kg: 12.0,
          weight_per_spring: 1.5,
          items: m1K800Items.filter((i) => i.shade_number && i.springs > 0),
          total_springs: m1K800Springs,
          total_kg: m1K800Kg,
          total_wages: m1K800Wages,
        },
        {
          section_id: 'dolly_gold',
          title: 'Dolly Gold',
          target_springs: m1DollyTarget,
          rate_per_kg: 4.5,
          weight_per_spring: 1.5,
          items: m1DollyItems.filter((i) => i.shade_number && i.springs > 0),
          total_springs: m1DollySprings,
          total_kg: m1DollyKg,
          total_wages: m1DollyWages,
        },
      ];
    } else {
      sectionsPayload = [
        {
          section_id: 'zip135',
          title: 'Zip 135 mtr',
          target_springs: 16,
          rate_per_kg: 40.0,
          weight_per_spring: 1.5,
          heads: m2Heads,
          total_springs: m2TotalSprings,
          total_kg: m2TotalKg,
          total_wages: m2TotalWages,
        },
      ];
    }

    const payload = {
      date: taskDate,
      machine_id: selectedMachine,
      operator_name: operatorName,
      quality_name: selectedMachine === 'M1' ? 'K800 + Dolly Gold' : 'Zip 135 mtr',
      start_time: timeStr,
      sections: sectionsPayload,
      total_springs: currentTotalSprings,
      total_kg: currentTotalKg,
      total_wages: currentTotalWages,
      parchi_image_url: parchiImageUrl,
      is_extra_m2: isExtraM2,
    };

    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/winding/tasks/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setActiveTaskId(data.id);
        setStartTime(timeStr);
        setTaskStatus('in_progress');
        fetchAvailableStock();
        fetchTasks();
        Alert.alert(
          '▶️ Task Started!',
          `Winding task started at ${timeStr}.\nस्प्रिंग्स स्टॉक इन हैंड (${currentPly}) से घटा दी गई हैं!`
        );
      } else {
        const errData = await res.json().catch(() => ({}));
        Alert.alert('Cannot Start Task', errData.detail || 'Failed to start task');
      }
    } catch (e) {
      console.error('Error starting task:', e);
      Alert.alert('Error', 'Network error while starting task');
    }
  };

  // Save / Complete Task Handler
  const handleCompleteTask = async () => {
    if (taskStatus !== 'in_progress' && !activeTaskId) {
      Alert.alert('Start Task First', 'पहले Start Task बटन दबाएं!');
      return;
    }

    if (!parchiImageUrl && !parchiBase64) {
      Alert.alert(
        '📷 Task Parchi Photo Compulsory (पर्ची की फोटो अनिवार्य है)',
        'टास्क पूरा करने से पहले पर्ची की फोटो खींचें या अपलोड करें! पर्ची की फोटो अनिवार्य (compulsory) है।'
      );
      return;
    }

    let finalImageUrl = parchiImageUrl;
    if (!finalImageUrl && parchiBase64) {
      try {
        setUploadingImage(true);
        const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/winding/upload-parchi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: parchiBase64,
            filename: `parchi_${selectedMachine}_${taskDate}.jpg`,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          finalImageUrl = data.url;
          setParchiImageUrl(data.url);
        } else {
          finalImageUrl = parchiBase64;
          setParchiImageUrl(parchiBase64);
        }
      } catch (e) {
        console.error('Error uploading photo during complete:', e);
        finalImageUrl = parchiBase64;
        setParchiImageUrl(parchiBase64);
      } finally {
        setUploadingImage(false);
      }
    }
    if (!finalImageUrl && parchiBase64) {
      finalImageUrl = parchiBase64;
    }

    const now = new Date();
    const endTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    try {
      const url = activeTaskId
        ? `${EXPO_PUBLIC_BACKEND_URL}/api/winding/tasks/${activeTaskId}/complete`
        : `${EXPO_PUBLIC_BACKEND_URL}/api/winding/tasks`;

      const method = 'POST';
      const bodyPayload = activeTaskId
        ? { end_time: endTimeStr, parchi_image_url: finalImageUrl }
        : {
            date: taskDate,
            machine_id: selectedMachine,
            operator_name: operatorName,
            quality_name: selectedMachine === 'M1' ? 'K800 + Dolly Gold' : 'Zip 135 mtr',
            status: 'completed',
            start_time: startTime || endTimeStr,
            end_time: endTimeStr,
            total_springs: currentTotalSprings,
            total_kg: currentTotalKg,
            total_wages: currentTotalWages,
            parchi_image_url: finalImageUrl,
            is_extra_m2: isExtraM2,
          };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      if (res.ok) {
        setEndTime(endTimeStr);
        setTaskStatus('completed');
        fetchTasks();
        Alert.alert(
          '🎉 Task Completed & Locked!',
          `Operator: ${operatorName}\nMachine: ${selectedMachine}\nTotal Springs: ${currentTotalSprings}\nTotal Weight: ${currentTotalKg.toFixed(
            1
          )} KG\nTotal Wages: ₹${currentTotalWages.toFixed(2)}\n\nटास्क पूरा हो गया है और अब लॉक हो चुका है।`
        );
      } else {
        const errData = await res.json().catch(() => ({}));
        Alert.alert('Error', errData.detail || 'Failed to complete task');
      }
    } catch (e) {
      console.error('Error completing task:', e);
      Alert.alert('Error', 'Network error while completing task');
    }
  };

  // Helper to add row in M1 K800
  const addM1K800Row = () => {
    setM1K800Items([...m1K800Items, { id: Date.now().toString(), shade_number: '', springs: 0 }]);
  };

  const removeM1K800Row = (index: number) => {
    if (m1K800Items.length <= 1) return;
    const updated = [...m1K800Items];
    updated.splice(index, 1);
    setM1K800Items(updated);
  };

  // Helper to add row in M1 Dolly Gold
  const addM1DollyRow = () => {
    setM1DollyItems([...m1DollyItems, { id: Date.now().toString(), shade_number: '', springs: 0 }]);
  };

  const removeM1DollyRow = (index: number) => {
    if (m1DollyItems.length <= 1) return;
    const updated = [...m1DollyItems];
    updated.splice(index, 1);
    setM1DollyItems(updated);
  };

  // Helper to add shade in a Head for M2/M3/M4 (Max 4 springs per head)
  const addHeadItem = (headIdx: number) => {
    const head = m2Heads[headIdx];
    const headSum = head.items.reduce((s, it) => s + (Number(it.springs) || 0), 0);
    const hTitle = head.head_number === 1 ? '1st' : head.head_number === 2 ? '2nd' : head.head_number === 3 ? '3rd' : '4th';
    if (headSum >= 4) {
      Alert.alert(
        'Head Full (अधिकतम 4 स्प्रिंग)',
        `${hTitle} Head mein already 4 springs poori ho chuki hain! Naya shade jodne ke liye pehle kisi shade ki spring kam karein.`
      );
      return;
    }
    const updated = [...m2Heads];
    updated[headIdx].items.push({ id: Date.now().toString(), shade_number: '', springs: 0 });
    setM2Heads(updated);
  };

  const removeHeadItem = (headIdx: number, itemIdx: number) => {
    if (m2Heads[headIdx].items.length <= 1) return;
    const updated = [...m2Heads];
    updated[headIdx].items.splice(itemIdx, 1);
    setM2Heads(updated);
    if (taskStatus === 'in_progress') syncTaskInProgress();
  };

  if (userRole === null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Hidden File Input for Mobile & Web Camera Capture */}
      {Platform.OS === 'web' && (
        <>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef as any}
            style={{ display: 'none' }}
            onChange={handlePhotoSelect}
          />
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={taskFileInputRef as any}
            style={{ display: 'none' }}
            onChange={handleTaskPhotoSelect}
          />
        </>
      )}

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {userRole === 'winding_operator' ? (
          <TouchableOpacity
            onPress={handleLogout}
            style={[
              styles.backButton,
              { backgroundColor: '#FED7D7', borderColor: '#FEB2B2', borderWidth: 1, paddingHorizontal: 12 }
            ]}
          >
            <Text style={[styles.backText, { color: '#C53030', fontWeight: 'bold' }]}>🚪 Logout</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={[styles.backText, { color: colors.primary }]}>← Back</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>🧵 Winding Master</Text>
            <View style={[styles.badge, { backgroundColor: '#805AD5' }]}>
              <Text style={styles.badgeText}>M1–M4</Text>
            </View>
          </View>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {userRole === 'winding_operator'
              ? `👤 ${operatorName} (${selectedMachine}) • टास्क & पर्ची अपलोड`
              : '📋 मास्टर डेली रजिस्टर (Daily Register) • ऑल मशीन M1–M4'}
          </Text>
        </View>
        {userRole !== 'winding_operator' && (
          <TouchableOpacity
            onPress={handleLogout}
            style={[styles.backButton, { backgroundColor: colors.inputBackground, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 10 }]}
          >
            <Text style={[styles.backText, { color: colors.textSecondary }]}>Logout</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Operator sees task entry; Admin & Master see Master Daily Register */}
      {userRole === 'winding_operator' ? (
        <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Machine & Worker Card (1 Worker - 1 Machine Locked) */}
          <View style={[styles.sectionCard, { borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.machineBadgeLarge, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{selectedMachine}</Text>
                </View>
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 2 }]}>
                    🏭 Assigned Machine: {selectedMachine}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    {selectedMachine === 'M1'
                      ? 'Kohinoor 800 mtr (K800) + Dolly Gold'
                      : `${selectedMachine} - Zip 135 mtr (4 Heads)`}
                  </Text>
                </View>
              </View>
              <View style={{ backgroundColor: '#C6F6D5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#9AE6B4' }}>
                <Text style={{ color: '#22543D', fontSize: 11, fontWeight: 'bold' }}>🔒 Locked to Worker</Text>
              </View>
            </View>

            {/* Worker & Date Row */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Worker (वर्कर)</Text>
                <View
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.border,
                      justifyContent: 'center',
                    },
                  ]}
                >
                  <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 14 }}>
                    👤 {operatorName} <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: 'normal' }}>🔒 (Locked)</Text>
                  </Text>
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>📅 Task Date (कैलेंडर से तारीख)</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    value={taskDate}
                    onChange={(e) => setTaskDate(e.target.value)}
                    style={{
                      backgroundColor: colors.inputBackground,
                      color: colors.text,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      outline: 'none',
                      width: '100%',
                      boxSizing: 'border-box',
                      cursor: 'pointer',
                    }}
                  />
                ) : (
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                    value={taskDate}
                    onChangeText={setTaskDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textSecondary}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Start / Complete Task Timer Card */}
          <View style={[styles.timerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.timerHeader}>
              <View>
                <Text style={[styles.timerTitle, { color: colors.text }]}>⏱️ Task Timer & Status</Text>
                <Text style={[styles.timerSub, { color: colors.textSecondary }]}>
                  {taskStatus === 'in_progress'
                    ? `🟢 Task in Progress (Started: ${startTime})`
                    : taskStatus === 'completed'
                    ? `✅ Task Completed (Start: ${startTime} • End: ${endTime})`
                    : '⚪ Not Started Yet (शुरू नहीं हुआ)'}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  taskStatus === 'in_progress'
                    ? { backgroundColor: '#C6F6D5' }
                    : taskStatus === 'completed'
                    ? { backgroundColor: '#BEE3F8' }
                    : { backgroundColor: colors.inputBackground },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    taskStatus === 'in_progress'
                      ? { color: '#22543D' }
                      : taskStatus === 'completed'
                      ? { color: '#2B6CB0' }
                      : { color: colors.textSecondary },
                  ]}
                >
                  {taskStatus.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <TouchableOpacity
                onPress={handleStartTask}
                disabled={taskStatus === 'in_progress' || taskStatus === 'completed'}
                style={[
                  styles.actionBtn,
                  { backgroundColor: taskStatus === 'pending' ? '#38A169' : '#A0AEC0' },
                ]}
              >
                <Text style={styles.actionBtnText}>▶️ Start Task</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleCompleteTask}
                disabled={taskStatus !== 'in_progress'}
                style={[
                  styles.actionBtn,
                  { backgroundColor: taskStatus === 'in_progress' ? '#3182CE' : '#A0AEC0' },
                ]}
              >
                <Text style={styles.actionBtnText}>⏹️ Complete Task</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ============================================================== */}
          {/* MACHINE 1 FORMAT: K800 + Dolly Gold                            */}
          {/* ============================================================== */}
          {selectedMachine === 'M1' ? (
            <View>
              {/* Section 1: Kohinoor 800 mtr (K800) */}
              <View style={[styles.formatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.formatHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.formatTitle, { color: colors.text }]}>
                      🧵 1. Kohinoor 800 mtr (K800)
                    </Text>
                    <Text style={[styles.formatSubtitle, { color: colors.textSecondary }]}>
                      9 Heads • Standard: 36 Springs (54 KG) • Rate: ₹12.00 / KG
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.springsCountBadge,
                      m1K800Springs === 36 ? { backgroundColor: '#C6F6D5' } : { backgroundColor: '#FEEBC8' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.springsCountText,
                        m1K800Springs === 36 ? { color: '#22543D' } : { color: '#744210' },
                      ]}
                    >
                      {m1K800Springs} / 36 Springs
                    </Text>
                  </View>
                </View>

                {/* Rows Header */}
                <View style={[styles.rowHeader, { backgroundColor: colors.inputBackground }]}>
                  <Text style={[styles.rowHeaderCol, { flex: 1, color: colors.text }]}>Shade No. (#1–460)</Text>
                  <Text style={[styles.rowHeaderCol, { width: 72, textAlign: 'center', color: colors.text }]}>
                    Springs
                  </Text>
                  <View style={styles.spacerBtn} />
                </View>

                {/* Items List */}
                {m1K800Items.map((item, idx) => {
                  const cleanSn = item.shade_number ? item.shade_number.replace(/^#/, '') : '';
                  const availStock = stockMap[cleanSn]?.available ?? 0;
                  const prevQty = Number(item.springs) || 0;
                  const maxAllowed = taskStatus === 'in_progress' ? availStock + prevQty : availStock;

                  return (
                    <View key={item.id} style={{ marginBottom: 10 }}>
                      <View style={styles.entryRow}>
                        <View
                          style={[
                            styles.shadeCompoundBox,
                            { backgroundColor: colors.inputBackground, borderColor: colors.border },
                          ]}
                        >
                          <TextInput
                            style={[styles.shadeCompoundInput, { color: colors.text }]}
                            placeholder="Shade #1–#460"
                            placeholderTextColor={colors.textSecondary}
                            value={item.shade_number}
                            keyboardType="numeric"
                            editable={taskStatus !== 'completed'}
                            onChangeText={(val) => {
                              const updated = [...m1K800Items];
                              updated[idx].shade_number = val.replace(/^#/, '');
                              setM1K800Items(updated);
                            }}
                          />
                          <TouchableOpacity
                            style={[
                              styles.shadeDropdownBtn,
                              {
                                backgroundColor: 'rgba(128, 90, 213, 0.15)',
                                borderLeftColor: colors.border,
                                opacity: taskStatus === 'completed' ? 0.5 : 1,
                              },
                            ]}
                            disabled={taskStatus === 'completed'}
                            onPress={() => openShadePicker('k800', idx)}
                            activeOpacity={0.7}
                          >
                            <Text style={{ fontSize: 13, color: colors.primary, fontWeight: 'bold' }}>▼</Text>
                          </TouchableOpacity>
                        </View>
                        <TextInput
                          style={[
                            styles.springInput,
                            { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border },
                          ]}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={colors.textSecondary}
                          value={item.springs ? item.springs.toString() : ''}
                          editable={taskStatus !== 'completed'}
                          onChangeText={(val) => {
                            let entered = parseInt(val) || 0;
                            if (cleanSn && entered > maxAllowed) {
                              Alert.alert(
                                'Maximum Stock Limit',
                                `Shade #${cleanSn} has only ${maxAllowed} springs available in ${currentPly} stock!`
                              );
                              entered = maxAllowed;
                            }
                            const updated = [...m1K800Items];
                            updated[idx].springs = entered;
                            setM1K800Items(updated);
                            if (taskStatus === 'in_progress') syncTaskInProgress();
                          }}
                        />
                        {taskStatus !== 'completed' ? (
                          <TouchableOpacity onPress={() => removeM1K800Row(idx)} style={styles.deleteRowBtn}>
                            <Text style={{ color: colors.danger, fontSize: 16 }}>✕</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.spacerBtn} />
                        )}
                      </View>

                      {/* Stock in Hand Badge */}
                      {cleanSn ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, marginLeft: 2 }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: availStock > 0 ? '#E6FFFA' : '#FFF5F5',
                              borderColor: availStock > 0 ? '#81E6D9' : '#FEB2B2',
                              borderWidth: 1,
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 6,
                              gap: 4,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: 'bold', color: availStock > 0 ? '#234E52' : '#9B2C2C' }}>
                              {availStock > 0
                                ? `📦 Available: ${availStock} Springs (${currentPly} Stock)`
                                : `⚠️ 0 Springs in ${currentPly} Stock (Out of Stock)`}
                            </Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}

                {taskStatus !== 'completed' && (
                  <TouchableOpacity onPress={addM1K800Row} style={[styles.addBtn, { borderColor: colors.primary }]}>
                    <Text style={[styles.addBtnText, { color: colors.primary }]}>+ Add Shade (और शेड जोड़ें)</Text>
                  </TouchableOpacity>
                )}

                <View style={[styles.sectionSummary, { backgroundColor: colors.inputBackground }]}>
                  <Text style={[styles.summaryText, { color: colors.text }]}>
                    Weight: <Text style={{ fontWeight: 'bold' }}>{m1K800Kg.toFixed(1)} KG</Text>
                  </Text>
                  <Text style={[styles.summaryText, { color: colors.primary }]}>
                    Wages: <Text style={{ fontWeight: 'bold' }}>₹{m1K800Wages.toFixed(2)}</Text>
                  </Text>
                </View>
              </View>

              {/* Section 2: Dolly Gold */}
              <View style={[styles.formatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.formatHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.formatTitle, { color: colors.text }]}>🧵 2. Dolly Gold</Text>
                    <Text style={[styles.formatSubtitle, { color: colors.textSecondary }]}>
                      4 Heads • Rate: ₹4.50 / KG • (8 or 10 Springs)
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => setM1DollyTarget(8)}
                      disabled={taskStatus === 'completed'}
                      style={[
                        styles.dollyChoiceBtn,
                        m1DollyTarget === 8 && { backgroundColor: colors.primary, borderColor: colors.primary },
                        taskStatus === 'completed' && { opacity: 0.6 },
                      ]}
                    >
                      <Text style={[styles.dollyChoiceText, m1DollyTarget === 8 && { color: '#fff' }]}>8 Sp (12kg)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setM1DollyTarget(10)}
                      disabled={taskStatus === 'completed'}
                      style={[
                        styles.dollyChoiceBtn,
                        m1DollyTarget === 10 && { backgroundColor: colors.primary, borderColor: colors.primary },
                        taskStatus === 'completed' && { opacity: 0.6 },
                      ]}
                    >
                      <Text style={[styles.dollyChoiceText, m1DollyTarget === 10 && { color: '#fff' }]}>
                        10 Sp (15kg)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Rows Header */}
                <View style={[styles.rowHeader, { backgroundColor: colors.inputBackground }]}>
                  <Text style={[styles.rowHeaderCol, { flex: 1, color: colors.text }]}>Shade No. (#1–460)</Text>
                  <Text style={[styles.rowHeaderCol, { width: 72, textAlign: 'center', color: colors.text }]}>
                    Springs
                  </Text>
                  <View style={styles.spacerBtn} />
                </View>

                {/* Items List */}
                {m1DollyItems.map((item, idx) => {
                  const cleanSn = item.shade_number ? item.shade_number.replace(/^#/, '') : '';
                  const availStock = stockMap[cleanSn]?.available ?? 0;
                  const prevQty = Number(item.springs) || 0;
                  const maxAllowed = taskStatus === 'in_progress' ? availStock + prevQty : availStock;

                  return (
                    <View key={item.id} style={{ marginBottom: 10 }}>
                      <View style={styles.entryRow}>
                        <View
                          style={[
                            styles.shadeCompoundBox,
                            { backgroundColor: colors.inputBackground, borderColor: colors.border },
                          ]}
                        >
                          <TextInput
                            style={[styles.shadeCompoundInput, { color: colors.text }]}
                            placeholder="Shade #1–#460"
                            placeholderTextColor={colors.textSecondary}
                            value={item.shade_number}
                            keyboardType="numeric"
                            editable={taskStatus !== 'completed'}
                            onChangeText={(val) => {
                              const updated = [...m1DollyItems];
                              updated[idx].shade_number = val.replace(/^#/, '');
                              setM1DollyItems(updated);
                            }}
                          />
                          <TouchableOpacity
                            style={[
                              styles.shadeDropdownBtn,
                              {
                                backgroundColor: 'rgba(128, 90, 213, 0.15)',
                                borderLeftColor: colors.border,
                                opacity: taskStatus === 'completed' ? 0.5 : 1,
                              },
                            ]}
                            disabled={taskStatus === 'completed'}
                            onPress={() => openShadePicker('dolly', idx)}
                            activeOpacity={0.7}
                          >
                            <Text style={{ fontSize: 13, color: colors.primary, fontWeight: 'bold' }}>▼</Text>
                          </TouchableOpacity>
                        </View>
                        <TextInput
                          style={[
                            styles.springInput,
                            { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border },
                          ]}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={colors.textSecondary}
                          value={item.springs ? item.springs.toString() : ''}
                          editable={taskStatus !== 'completed'}
                          onChangeText={(val) => {
                            let entered = parseInt(val) || 0;
                            if (cleanSn && entered > maxAllowed) {
                              Alert.alert(
                                'Maximum Stock Limit',
                                `Shade #${cleanSn} has only ${maxAllowed} springs available in ${currentPly} stock!`
                              );
                              entered = maxAllowed;
                            }
                            const updated = [...m1DollyItems];
                            updated[idx].springs = entered;
                            setM1DollyItems(updated);
                            if (taskStatus === 'in_progress') syncTaskInProgress();
                          }}
                        />
                        {taskStatus !== 'completed' ? (
                          <TouchableOpacity onPress={() => removeM1DollyRow(idx)} style={styles.deleteRowBtn}>
                            <Text style={{ color: colors.danger, fontSize: 16 }}>✕</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.spacerBtn} />
                        )}
                      </View>

                      {/* Stock in Hand Badge */}
                      {cleanSn ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, marginLeft: 2 }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: availStock > 0 ? '#E6FFFA' : '#FFF5F5',
                              borderColor: availStock > 0 ? '#81E6D9' : '#FEB2B2',
                              borderWidth: 1,
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 6,
                              gap: 4,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: 'bold', color: availStock > 0 ? '#234E52' : '#9B2C2C' }}>
                              {availStock > 0
                                ? `📦 Available: ${availStock} Springs (${currentPly} Stock)`
                                : `⚠️ 0 Springs in ${currentPly} Stock (Out of Stock)`}
                            </Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}

                {taskStatus !== 'completed' && (
                  <TouchableOpacity onPress={addM1DollyRow} style={[styles.addBtn, { borderColor: colors.primary }]}>
                    <Text style={[styles.addBtnText, { color: colors.primary }]}>+ Add Shade (और शेड जोड़ें)</Text>
                  </TouchableOpacity>
                )}

                <View style={[styles.sectionSummary, { backgroundColor: colors.inputBackground }]}>
                  <Text style={[styles.summaryText, { color: colors.text }]}>
                    Springs: {m1DollySprings} / {m1DollyTarget} • Weight: {m1DollyKg.toFixed(1)} KG
                  </Text>
                  <Text style={[styles.summaryText, { color: colors.primary }]}>
                    Wages: ₹{m1DollyWages.toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            /* ============================================================== */
            /* MACHINES M2, M3, M4 FORMAT: Zip 135 mtr (4 Heads × 4 Springs)   */
            /* ============================================================== */
            <View>
              <View style={[styles.formatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.formatHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.formatTitle, { color: colors.text }]}>
                      ⚡ {selectedMachine} — Zip 135 mtr
                    </Text>
                    <Text style={[styles.formatSubtitle, { color: colors.textSecondary }]}>
                      4 Heads • 4 Springs / Head = 16 Springs (24 KG) • Rate: ₹40.00 / KG
                    </Text>
                  </View>
                  <View style={[styles.springsCountBadge, { backgroundColor: '#FAF5FF', borderColor: '#D6BCFA' }]}>
                    <Text style={[styles.springsCountText, { color: '#6B46C1' }]}>
                      {m2TotalSprings} / 16 Springs
                    </Text>
                  </View>
                </View>

                {/* 4 Heads Grid */}
                {m2Heads.map((head, hIdx) => {
                  const headSum = head.items.reduce((s, it) => s + (Number(it.springs) || 0), 0);
                  const isFull = headSum === 4;

                  return (
                    <View
                      key={head.head_number}
                      style={[
                        styles.headCard,
                        { backgroundColor: colors.inputBackground, borderColor: isFull ? '#38A169' : colors.border },
                      ]}
                    >
                      <View style={styles.headCardHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.headCardTitle, { color: colors.text }]}>
                            📍 {head.head_number}
                            {head.head_number === 1 ? 'st' : head.head_number === 2 ? 'nd' : head.head_number === 3 ? 'rd' : 'th'} Head
                          </Text>
                          <View
                            style={{
                              backgroundColor: headSum === 4 ? '#C6F6D5' : headSum > 4 ? '#FED7D7' : '#EBF8FF',
                              paddingHorizontal: 6,
                              paddingVertical: 1,
                              borderRadius: 4,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: 'bold',
                                color: headSum === 4 ? '#22543D' : headSum > 4 ? '#C53030' : '#2B6CB0',
                              }}
                            >
                              Max 4
                            </Text>
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.headSumBadge,
                            isFull ? { color: '#38A169', fontWeight: 'bold' } : { color: colors.textSecondary },
                          ]}
                        >
                          {headSum} / 4 Springs {isFull ? '✅' : ''}
                        </Text>
                      </View>

                      {/* Head Columns Header */}
                      <View style={[styles.headRowHeader, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.headRowHeaderCol, { flex: 1, color: colors.textSecondary }]}>
                          Shade No. (#1–460)
                        </Text>
                        <Text
                          style={[
                            styles.headRowHeaderCol,
                            { width: 72, textAlign: 'center', color: colors.textSecondary },
                          ]}
                        >
                          Springs
                        </Text>
                        <View style={styles.spacerBtn} />
                      </View>

                      {head.items.map((it, iIdx) => {
                        const cleanSn = it.shade_number ? it.shade_number.replace(/^#/, '') : '';
                        const availStock = stockMap[cleanSn]?.available ?? 0;
                        const prevQty = Number(it.springs) || 0;
                        const maxAllowed = taskStatus === 'in_progress' ? availStock + prevQty : availStock;

                        return (
                          <View key={it.id} style={{ marginBottom: 10 }}>
                            <View style={styles.entryRow}>
                              <View
                                style={[
                                  styles.shadeCompoundBox,
                                  { backgroundColor: colors.card, borderColor: colors.border },
                                ]}
                              >
                                <TextInput
                                  style={[styles.shadeCompoundInput, { color: colors.text }]}
                                  placeholder="Shade #1–#460"
                                  placeholderTextColor={colors.textSecondary}
                                  value={it.shade_number}
                                  keyboardType="numeric"
                                  editable={taskStatus !== 'completed'}
                                  onChangeText={(val) => {
                                    const updated = [...m2Heads];
                                    updated[hIdx].items[iIdx].shade_number = val.replace(/^#/, '');
                                    setM2Heads(updated);
                                  }}
                                />
                                <TouchableOpacity
                                  style={[
                                    styles.shadeDropdownBtn,
                                    {
                                      backgroundColor: 'rgba(128, 90, 213, 0.15)',
                                      borderLeftColor: colors.border,
                                      opacity: taskStatus === 'completed' ? 0.5 : 1,
                                    },
                                  ]}
                                  disabled={taskStatus === 'completed'}
                                  onPress={() => openShadePicker('head', iIdx, hIdx)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={{ fontSize: 13, color: colors.primary, fontWeight: 'bold' }}>▼</Text>
                                </TouchableOpacity>
                              </View>
                              <TextInput
                                style={[
                                  styles.springInput,
                                  { backgroundColor: colors.card, color: colors.text, borderColor: colors.border },
                                ]}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor={colors.textSecondary}
                                value={it.springs ? it.springs.toString() : ''}
                                editable={taskStatus !== 'completed'}
                                onChangeText={(val) => {
                                  let entered = parseInt(val) || 0;

                                  // 1. Max 4 springs per head limit
                                  const otherSpringsInHead = head.items.reduce(
                                    (sum, item, idx) => idx !== iIdx ? sum + (Number(item.springs) || 0) : sum,
                                    0
                                  );
                                  const maxHeadCapacity = Math.max(0, 4 - otherSpringsInHead);

                                  if (entered > maxHeadCapacity) {
                                    const hTitle = head.head_number === 1 ? '1st' : head.head_number === 2 ? '2nd' : head.head_number === 3 ? '3rd' : '4th';
                                    Alert.alert(
                                      'Per Head Limit (अधिकतम 4 स्प्रिंग)',
                                      `${hTitle} Head mein 4 se jyada springs nahi le sakte!\nइस हेड में अधिकतम ${maxHeadCapacity} स्प्रिंग ही ले सकते हैं।`
                                    );
                                    entered = maxHeadCapacity;
                                  }

                                  // 2. Maximum stock limit
                                  if (cleanSn && entered > maxAllowed) {
                                    Alert.alert(
                                      'Maximum Stock Limit',
                                      `Shade #${cleanSn} has only ${maxAllowed} springs available in ${currentPly} stock!`
                                    );
                                    entered = Math.min(entered, maxAllowed);
                                  }
                                  const updated = [...m2Heads];
                                  updated[hIdx].items[iIdx].springs = entered;
                                  setM2Heads(updated);
                                  if (taskStatus === 'in_progress') syncTaskInProgress();
                                }}
                              />
                              {taskStatus !== 'completed' && head.items.length > 1 ? (
                                <TouchableOpacity
                                  onPress={() => removeHeadItem(hIdx, iIdx)}
                                  style={styles.deleteRowBtn}
                                >
                                  <Text style={{ color: colors.danger, fontSize: 16 }}>✕</Text>
                                </TouchableOpacity>
                              ) : (
                                <View style={styles.spacerBtn} />
                              )}
                            </View>

                            {/* Stock in Hand Badge */}
                            {cleanSn ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, marginLeft: 2 }}>
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: availStock > 0 ? '#E6FFFA' : '#FFF5F5',
                                    borderColor: availStock > 0 ? '#81E6D9' : '#FEB2B2',
                                    borderWidth: 1,
                                    paddingHorizontal: 8,
                                    paddingVertical: 3,
                                    borderRadius: 6,
                                    gap: 4,
                                  }}
                                >
                                  <Text style={{ fontSize: 11, fontWeight: 'bold', color: availStock > 0 ? '#234E52' : '#9B2C2C' }}>
                                    {availStock > 0
                                      ? `📦 Available: ${availStock} Springs (${currentPly} Stock)`
                                      : `⚠️ 0 Springs in ${currentPly} Stock (Out of Stock)`}
                                  </Text>
                                </View>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}

                      {taskStatus !== 'completed' && (
                        <TouchableOpacity
                          onPress={() => addHeadItem(hIdx)}
                          style={[
                            styles.addHeadShadeBtn,
                            {
                              borderColor: colors.primary,
                              backgroundColor: colors.card,
                            },
                          ]}
                        >
                          <Text style={[styles.addHeadShadeBtnText, { color: colors.primary }]}>
                            + Add Shade in {head.head_number === 1 ? '1st' : head.head_number === 2 ? '2nd' : head.head_number === 3 ? '3rd' : '4th'} Head (और शेड जोड़ें)
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}

                <View style={[styles.sectionSummary, { backgroundColor: colors.inputBackground, marginTop: 14 }]}>
                  <Text style={[styles.summaryText, { color: colors.text }]}>
                    Weight: <Text style={{ fontWeight: 'bold' }}>{m2TotalKg.toFixed(1)} KG</Text>
                  </Text>
                  <Text style={[styles.summaryText, { color: colors.primary }]}>
                    Wages: <Text style={{ fontWeight: 'bold' }}>₹{m2TotalWages.toFixed(2)}</Text>
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ============================================================== */}
          {/* PARCHI PHOTO UPLOAD SECTION                                     */}
          {/* ============================================================== */}
          <View
            style={[
              styles.photoCard,
              {
                backgroundColor: colors.card,
                borderColor: !parchiImageUrl && !parchiBase64 ? '#E53E3E' : colors.border,
                borderWidth: !parchiImageUrl && !parchiBase64 ? 1.5 : 1,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                📷 Task Parchi Photo (पर्ची की फोटो) *
              </Text>
              <View style={{ backgroundColor: !parchiImageUrl && !parchiBase64 ? '#FED7D7' : '#C6F6D5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: !parchiImageUrl && !parchiBase64 ? '#C53030' : '#22543D' }}>
                  {!parchiImageUrl && !parchiBase64 ? '⚠️ अनिवार्य (Compulsory)' : '✅ Uploaded'}
                </Text>
              </View>
            </View>
            <Text style={[styles.formatSubtitle, { color: colors.textSecondary, marginBottom: 12 }]}>
              Worker slip / parchi ki photo camera se kheench kar upload karein (टास्क शुरू और पूरा करने के लिए अनिवार्य है)
            </Text>

            {parchiImageUrl || parchiBase64 ? (
              <View style={styles.imagePreviewContainer}>
                <Image
                  source={{ uri: parchiImageUrl || parchiBase64 || '' }}
                  style={styles.parchiThumb}
                  resizeMode="cover"
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: '#38A169', fontWeight: 'bold', fontSize: 14 }}>
                    ✅ Parchi Uploaded!
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                    {uploadingImage ? 'Uploading to server...' : 'Uploaded successfully.'}
                  </Text>
                  {taskStatus !== 'completed' && (
                    <TouchableOpacity
                      onPress={() => {
                        if (Platform.OS === 'web' && fileInputRef.current) {
                          fileInputRef.current.click();
                        }
                      }}
                      style={[styles.reuploadBtn, { borderColor: colors.primary }]}
                    >
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: 'bold' }}>
                        🔄 Re-take Photo
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS === 'web' && fileInputRef.current) {
                    fileInputRef.current.click();
                  } else {
                    Alert.alert('Upload', 'Please select image file');
                  }
                }}
                disabled={uploadingImage || taskStatus === 'completed'}
                style={[
                  styles.uploadBox,
                  { backgroundColor: colors.inputBackground, borderColor: colors.primary },
                  taskStatus === 'completed' && { opacity: 0.5 },
                ]}
              >
                {uploadingImage ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Text style={{ fontSize: 32, marginBottom: 6 }}>📸</Text>
                    <Text style={[styles.uploadBoxText, { color: colors.primary }]}>
                      Take Photo with Camera / Select Slip
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
                      Directly uploads to Cloudinary / Storage
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* ============================================================== */}
          {/* OPERATOR'S INDIVIDUAL RECORDED TASKS                           */}
          {/* ============================================================== */}
          <View style={{ marginTop: 20, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 2 }]}>
                  📝 My Recorded Tasks ({operatorTasks.length})
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                  👤 {operatorName} ({selectedMachine}) • {taskDate} के रिकॉर्ड किए गए टास्क
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>{operatorTasks.length} Recorded</Text>
              </View>
            </View>

            {loadingTasks ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 16 }} />
            ) : operatorTasks.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 18 }]}>
                <Text style={{ fontSize: 28, marginBottom: 6 }}>🔍</Text>
                <Text style={[styles.emptyTitle, { color: colors.text, fontSize: 14 }]}>No Tasks Recorded for Today</Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary, fontSize: 12 }]}>
                  आज ({taskDate}) के लिए आपका कोई टास्क अभी तक रिकॉर्ड नहीं हुआ है। ऊपर Start Task करके काम पूरा करने पर Complete Task दबाएं।
                </Text>
              </View>
            ) : (
              operatorTasks.map((t) => (
                <View
                  key={t.id}
                  style={[styles.taskItemCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 10 }]}
                >
                  <View style={styles.taskItemHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[styles.machineTag, { backgroundColor: colors.primary }]}>
                        <Text style={styles.machineTagText}>{t.machine_id}</Text>
                      </View>
                      <View>
                        <Text style={[styles.taskOperator, { color: colors.text }]}>
                          👤 {t.operator_name || operatorName}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                          {t.quality_name} • {t.date}
                        </Text>
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#38A169' }}>
                        ₹{t.total_wages.toFixed(2)}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        {t.total_springs} Sp ({t.total_kg} KG)
                      </Text>
                    </View>
                  </View>

                  {/* Timings & Status */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
                    {(t.start_time || t.end_time) && (
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                        ⏱️ Time: {t.start_time || 'N/A'} ➡️ {t.end_time || 'N/A'}
                      </Text>
                    )}
                    <View
                      style={{
                        backgroundColor: t.status === 'completed' ? '#C6F6D5' : '#FEFCBF',
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: 'bold',
                          color: t.status === 'completed' ? '#22543D' : '#744210',
                        }}
                      >
                        {t.status === 'completed' ? '✅ Completed' : '🟢 In Progress'}
                      </Text>
                    </View>
                  </View>

                  {/* Shades Worked On Breakdown */}
                  {(() => {
                    const taskShades = extractShadesFromTask(t);
                    return (
                      <View
                        style={[
                          styles.shadesSummaryBox,
                          { backgroundColor: colors.background, borderColor: colors.border },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.text }}>
                            🧵 Shades & Springs Used (काम किए गए शेड्स):
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            Total: {t.total_springs} Springs
                          </Text>
                        </View>
                        {taskShades.length > 0 ? (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {taskShades.map((sh, idx) => (
                              <View
                                key={idx}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  backgroundColor: colors.primaryLight,
                                  borderColor: colors.primary,
                                  borderWidth: 1,
                                  borderRadius: 6,
                                  paddingHorizontal: 8,
                                  paddingVertical: 3,
                                  gap: 4,
                                }}
                              >
                                <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.primary }}>
                                  #{sh.shade}
                                </Text>
                                <View style={{ width: 1, height: 10, backgroundColor: colors.primary, opacity: 0.3 }} />
                                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text }}>
                                  {sh.springs} Sp
                                </Text>
                                {sh.sectionName ? (
                                  <Text style={{ fontSize: 9, color: colors.textSecondary, marginLeft: 2 }}>
                                    ({sh.sectionName})
                                  </Text>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={{ fontSize: 11, color: colors.textSecondary, fontStyle: 'italic' }}>
                            No shade details recorded
                          </Text>
                        )}
                      </View>
                    );
                  })()}

                  {/* Parchi Photo View / Attachment Card */}
                  {t.parchi_image_url ? (
                    <View style={[styles.parchiRecordCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setSelectedPhotoModal(t.parchi_image_url || null)}
                        style={styles.parchiThumbWrapper}
                      >
                        <Image
                          source={{ uri: resolveImageUrl(t.parchi_image_url) }}
                          style={styles.parchiRecordThumb}
                          resizeMode="cover"
                        />
                        <View style={styles.parchiZoomBadge}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>🔍 Zoom</Text>
                        </View>
                      </TouchableOpacity>
                      <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text }}>
                            📜 Task Parchi Photo
                          </Text>
                          <View style={{ backgroundColor: '#C6F6D5', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, color: '#22543D', fontWeight: 'bold' }}>
                              ✅ Attached
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                          पर्ची की फोटो सुरक्षित है। पूरा देखने के लिए दबाएं।
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <TouchableOpacity
                            onPress={() => setSelectedPhotoModal(t.parchi_image_url || null)}
                            style={[styles.smallActionBtn, { backgroundColor: colors.primary }]}
                          >
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                              🔍 View Parchi (पर्ची देखें)
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => triggerTaskPhotoUpload(t.id)}
                            style={[styles.smallActionBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                          >
                            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>
                              🔄 Replace Photo
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.parchiMissingCard, { backgroundColor: '#FFF5F5', borderColor: '#FEB2B2' }]}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#C53030' }}>
                          ⚠️ Parchi Not Attached (पर्ची अपलोड नहीं है)
                        </Text>
                        <Text style={{ fontSize: 11, color: '#9B2C2C', marginTop: 2 }}>
                          इस टास्क के साथ पर्ची की फोटो संलग्न नहीं है।
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => triggerTaskPhotoUpload(t.id)}
                        style={[styles.smallActionBtn, { backgroundColor: '#E53E3E' }]}
                      >
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                          📤 Upload Parchi
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>

          {/* Sticky Total Bar */}
          <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <View>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                Today's Production ({operatorTasks.length} {operatorTasks.length === 1 ? 'Task' : 'Tasks'})
              </Text>
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 16 }}>
                {operatorDayTotals.totalSprings} Springs ({operatorDayTotals.totalKg.toFixed(1)} KG)
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Total Wages (आज की कुल मजदूरी)</Text>
              <Text style={{ color: '#38A169', fontWeight: 'bold', fontSize: 20 }}>
                ₹{operatorDayTotals.totalWages.toFixed(2)}
              </Text>
            </View>
          </View>
        </ScrollView>
      ) : (
        /* ============================================================== */
        /* MASTER REGISTER / ALL TASKS VIEW                                */
        /* ============================================================== */
        <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Summary Dashboard Cards */}
          <View style={styles.summaryGrid}>
            <View style={[styles.dashCard, { backgroundColor: '#EBF8FF', borderColor: '#BEE3F8' }]}>
              <Text style={{ color: '#2B6CB0', fontSize: 12, fontWeight: 'bold' }}>TOTAL PRODUCTION</Text>
              <Text style={{ color: '#2B6CB0', fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                {summaryData?.total_springs || 0} Springs
              </Text>
              <Text style={{ color: '#2B6CB0', fontSize: 12 }}>{summaryData?.total_kg || 0} KG</Text>
            </View>

            <View style={[styles.dashCard, { backgroundColor: '#F0FFF4', borderColor: '#C6F6D5' }]}>
              <Text style={{ color: '#276749', fontSize: 12, fontWeight: 'bold' }}>TOTAL WAGES (₹)</Text>
              <Text style={{ color: '#276749', fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                ₹{summaryData?.total_wages || 0}
              </Text>
              <Text style={{ color: '#276749', fontSize: 12 }}>
                {summaryData?.completed_tasks || 0} Completed Tasks
              </Text>
            </View>
          </View>

          {/* Machine Breakdown */}
          <View style={[styles.sectionCard, { marginTop: 12 }]}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 10 }]}>
              📊 Machine Breakdown ({taskDate})
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['M1', 'M2', 'M3', 'M4'].map((m) => {
                const s = summaryData?.machine_summary?.[m] || { total_springs: 0, total_wages: 0 };
                return (
                  <View
                    key={m}
                    style={[styles.mBreakdownCard, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                  >
                    <Text style={{ fontWeight: 'bold', color: colors.primary, fontSize: 15 }}>{m}</Text>
                    <Text style={{ fontSize: 13, color: colors.text, marginTop: 4, fontWeight: '600' }}>
                      {s.total_springs} Sp
                    </Text>
                    <Text style={{ fontSize: 11, color: '#38A169', fontWeight: 'bold' }}>
                      ₹{s.total_wages}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Tasks List */}
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 10 }]}>
              📝 Recorded Tasks ({tasksList.length})
            </Text>

            {loadingTasks ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
            ) : tasksList.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>🔍</Text>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Winding Tasks Found</Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                  No tasks recorded for {taskDate} yet. Use Operator Task Entry tab to record tasks.
                </Text>
              </View>
            ) : (
              tasksList.map((t) => (
                <View
                  key={t.id}
                  style={[styles.taskItemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.taskItemHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[styles.machineTag, { backgroundColor: colors.primary }]}>
                        <Text style={styles.machineTagText}>{t.machine_id}</Text>
                      </View>
                      <View>
                        <Text style={[styles.taskOperator, { color: colors.text }]}>
                          {t.operator_name || 'Operator'}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                          {t.quality_name} • {t.date}
                        </Text>
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#38A169' }}>
                        ₹{t.total_wages.toFixed(2)}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        {t.total_springs} Sp ({t.total_kg} KG)
                      </Text>
                    </View>
                  </View>

                  {/* Timings */}
                  {(t.start_time || t.end_time) && (
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 8 }}>
                      ⏱️ Time: {t.start_time || 'N/A'} ➡️ {t.end_time || 'N/A'}
                    </Text>
                  )}

                  {/* Shades Worked On Breakdown */}
                  {(() => {
                    const taskShades = extractShadesFromTask(t);
                    return (
                      <View
                        style={[
                          styles.shadesSummaryBox,
                          { backgroundColor: colors.background, borderColor: colors.border },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.text }}>
                            🧵 Shades & Springs Used (काम किए गए शेड्स):
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            Total: {t.total_springs} Springs
                          </Text>
                        </View>
                        {taskShades.length > 0 ? (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {taskShades.map((sh, idx) => (
                              <View
                                key={idx}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  backgroundColor: colors.primaryLight,
                                  borderColor: colors.primary,
                                  borderWidth: 1,
                                  borderRadius: 6,
                                  paddingHorizontal: 8,
                                  paddingVertical: 3,
                                  gap: 4,
                                }}
                              >
                                <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.primary }}>
                                  #{sh.shade}
                                </Text>
                                <View style={{ width: 1, height: 10, backgroundColor: colors.primary, opacity: 0.3 }} />
                                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text }}>
                                  {sh.springs} Sp
                                </Text>
                                {sh.sectionName ? (
                                  <Text style={{ fontSize: 9, color: colors.textSecondary, marginLeft: 2 }}>
                                    ({sh.sectionName})
                                  </Text>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={{ fontSize: 11, color: colors.textSecondary, fontStyle: 'italic' }}>
                            No shade details recorded
                          </Text>
                        )}
                      </View>
                    );
                  })()}

                  {/* Parchi Photo View / Attachment Card */}
                  {t.parchi_image_url ? (
                    <View style={[styles.parchiRecordCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setSelectedPhotoModal(t.parchi_image_url || null)}
                        style={styles.parchiThumbWrapper}
                      >
                        <Image
                          source={{ uri: resolveImageUrl(t.parchi_image_url) }}
                          style={styles.parchiRecordThumb}
                          resizeMode="cover"
                        />
                        <View style={styles.parchiZoomBadge}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>🔍 Zoom</Text>
                        </View>
                      </TouchableOpacity>
                      <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text }}>
                            📜 Task Parchi Photo
                          </Text>
                          <View style={{ backgroundColor: '#C6F6D5', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, color: '#22543D', fontWeight: 'bold' }}>
                              ✅ Attached
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                          पर्ची की फोटो सुरक्षित है। पूरा देखने के लिए दबाएं।
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <TouchableOpacity
                            onPress={() => setSelectedPhotoModal(t.parchi_image_url || null)}
                            style={[styles.smallActionBtn, { backgroundColor: colors.primary }]}
                          >
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                              🔍 View Parchi (पर्ची देखें)
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => triggerTaskPhotoUpload(t.id)}
                            style={[styles.smallActionBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                          >
                            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>
                              🔄 Replace Photo
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.parchiMissingCard, { backgroundColor: '#FFF5F5', borderColor: '#FEB2B2' }]}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#C53030' }}>
                          ⚠️ Parchi Not Attached (पर्ची अपलोड नहीं है)
                        </Text>
                        <Text style={{ fontSize: 11, color: '#9B2C2C', marginTop: 2 }}>
                          इस टास्क के साथ पर्ची की फोटो संलग्न नहीं है।
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => triggerTaskPhotoUpload(t.id)}
                        style={[styles.smallActionBtn, { backgroundColor: '#E53E3E' }]}
                      >
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                          📤 Upload Parchi
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {/* Photo Modal */}
      <Modal visible={!!selectedPhotoModal} transparent={true} animationType="fade">
        <View style={styles.photoModalOverlay}>
          <View style={[styles.photoModalContent, { backgroundColor: colors.card }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 16, color: colors.text }}>
                📜 Winding Task Parchi (पर्ची)
              </Text>
              <TouchableOpacity onPress={() => setSelectedPhotoModal(null)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 20, color: colors.text, fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>
            {selectedPhotoModal && (
              <Image
                source={{
                  uri: resolveImageUrl(selectedPhotoModal),
                }}
                style={styles.fullParchiImage}
                resizeMode="contain"
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Shade Selection Dropdown & Range Modal */}
      <Modal
        visible={shadePickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShadePickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.shadeModalBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Modal Header */}
            <View style={styles.shadeModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.shadeModalTitle, { color: colors.text }]}>
                  🎨 Select Shade {shadeTarget?.section === 'head' && shadeTarget.headIdx !== undefined
                    ? `(📍 ${shadeTarget.headIdx + 1}${shadeTarget.headIdx === 0 ? 'st' : shadeTarget.headIdx === 1 ? 'nd' : shadeTarget.headIdx === 2 ? 'rd' : 'th'} Head)`
                    : ''}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                  Range #1 to #460 (लिखें या सीधे टैप करें)
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShadePickerVisible(false)}
                style={[styles.closeBtn, { backgroundColor: colors.inputBackground }]}
              >
                <Text style={{ fontSize: 16, color: colors.textSecondary, fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Mode Switcher: Single vs Multi-Shade */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  setMultiSelectMode(false);
                  setSelectedShadesList([]);
                }}
                style={[
                  styles.modeTabBtn,
                  !multiSelectMode
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: colors.inputBackground, borderColor: colors.border },
                ]}
              >
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: !multiSelectMode ? '#fff' : colors.text }}>
                  Single Shade (एक शेड)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setMultiSelectMode(true);
                  if (shadeTarget) {
                    let currentShade = '';
                    if (shadeTarget.section === 'head' && shadeTarget.headIdx !== undefined) {
                      currentShade = m2Heads[shadeTarget.headIdx].items[shadeTarget.rowIdx]?.shade_number || '';
                    } else if (shadeTarget.section === 'k800') {
                      currentShade = m1K800Items[shadeTarget.rowIdx]?.shade_number || '';
                    } else if (shadeTarget.section === 'dolly') {
                      currentShade = m1DollyItems[shadeTarget.rowIdx]?.shade_number || '';
                    }
                    if (currentShade && !selectedShadesList.includes(currentShade)) {
                      setSelectedShadesList([currentShade]);
                    }
                  }
                }}
                style={[
                  styles.modeTabBtn,
                  multiSelectMode
                    ? { backgroundColor: '#7C3AED', borderColor: '#7C3AED' }
                    : { backgroundColor: colors.inputBackground, borderColor: colors.border },
                ]}
              >
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: multiSelectMode ? '#fff' : colors.text }}>
                  ☑️ Multi-Shade (एक से ज्यादा शेड) {selectedShadesList.length > 0 ? `(${selectedShadesList.length})` : ''}
                </Text>
              </TouchableOpacity>
            </View>

            {multiSelectMode && (
              <View style={[styles.multiSelectBanner, { backgroundColor: '#EDE9FE', borderColor: '#C4B5FD' }]}>
                <Text style={{ fontSize: 12, color: '#5B21B6', fontWeight: 'bold' }}>
                  💡 नीचे से जितने चाहे शेड टैप करके चुनें ({selectedShadesList.length} चुने गए)
                </Text>
              </View>
            )}

            {/* Direct Search / Typing Box inside Modal */}
            <View style={{ marginBottom: 10 }}>
              <TextInput
                style={[
                  styles.shadeSearchInput,
                  { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.primary },
                ]}
                placeholder="🔍 Type shade number (e.g. 15, 136, 460)..."
                placeholderTextColor={colors.textSecondary}
                value={shadeSearch}
                onChangeText={setShadeSearch}
                keyboardType="numeric"
                autoFocus
                onSubmitEditing={() => {
                  if (shadeSearch.trim()) {
                    const clean = shadeSearch.trim().replace(/^#/, '');
                    if (multiSelectMode) {
                      toggleMultiShade(clean);
                      setShadeSearch('');
                    } else {
                      handleSelectShade(clean);
                    }
                  }
                }}
              />
            </View>

            {/* In-Stock Filter Toggle & Range Filter Tabs */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.textSecondary }}>
                Stock Filter ({currentPly}):
              </Text>
              <TouchableOpacity
                onPress={() => setInStockOnlyFilter(!inStockOnlyFilter)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: inStockOnlyFilter ? '#C6F6D5' : colors.inputBackground,
                  borderColor: inStockOnlyFilter ? '#38A169' : colors.border,
                  borderWidth: 1,
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  gap: 4,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: inStockOnlyFilter ? '#22543D' : colors.text }}>
                  {inStockOnlyFilter ? '✅ In-Stock Only' : '📦 Show In-Stock Only'} ({inStockCount})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Quick Range Filter Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10, maxHeight: 36 }}>
              {(['all', '1-100', '101-200', '201-300', '301-400', '401-460'] as const).map((r) => {
                const isSelected = rangeTab === r;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setRangeTab(r)}
                    style={[
                      styles.rangeTabBtn,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.inputBackground,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 12, fontWeight: 'bold' }}>
                      {r === 'all' ? 'All (1–460)' : `#${r}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Shades Grid (Range #1 to #460) */}
            <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={styles.shadesGrid}>
              {filteredShades.map((sn) => {
                const isSelected = selectedShadesList.includes(sn);
                const avail = stockMap[sn]?.available ?? 0;
                const hasStock = avail > 0;

                return (
                  <TouchableOpacity
                    key={sn}
                    onPress={() => {
                      if (!hasStock) {
                        Alert.alert(
                          'Out of Stock (स्टॉक नहीं है)',
                          `Shade #${sn} has 0 springs available in ${currentPly} stock! (स्टॉक में उपलब्ध नहीं है)`
                        );
                        return;
                      }
                      if (multiSelectMode) {
                        toggleMultiShade(sn);
                      } else {
                        handleSelectShade(sn);
                      }
                    }}
                    style={[
                      styles.shadeChip,
                      isSelected
                        ? { backgroundColor: '#7C3AED', borderColor: '#6D28D9' }
                        : hasStock
                        ? {
                            backgroundColor: colors.inputBackground,
                            borderColor: colors.border,
                          }
                        : {
                            backgroundColor: colors.inputBackground,
                            borderColor: '#FEB2B2',
                            opacity: 0.5,
                          },
                    ]}
                  >
                    <Text
                      style={[
                        styles.shadeChipText,
                        { color: isSelected ? '#fff' : hasStock ? colors.text : colors.textSecondary },
                      ]}
                    >
                      {isSelected ? `✓ #${sn}` : `#${sn}`}
                    </Text>
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: 'bold',
                        marginTop: 2,
                        color: isSelected ? '#E9D8FD' : hasStock ? '#38A169' : '#E53E3E',
                      }}
                    >
                      {hasStock ? `${avail} sp` : '0 sp'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {filteredShades.length === 0 && (
                <View style={{ width: '100%', padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, marginBottom: 10 }}>No matching shade for "{shadeSearch}"</Text>
                  {shadeSearch.trim() && (
                    <TouchableOpacity
                      onPress={() => {
                        const clean = shadeSearch.trim().replace(/^#/, '');
                        if (multiSelectMode) {
                          toggleMultiShade(clean);
                          setShadeSearch('');
                        } else {
                          handleSelectShade(clean);
                        }
                      }}
                      style={{ backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                        {multiSelectMode ? `+ Add "#${shadeSearch.trim().replace(/^#/, '')}" to Selection` : `Use "#${shadeSearch.trim().replace(/^#/, '')}"`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Multi-Select Floating Apply Bar */}
            {multiSelectMode && (
              <View style={[styles.multiApplyBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
                <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text }}>
                  {selectedShadesList.length} Shades Selected
                </Text>
                <TouchableOpacity
                  onPress={handleApplyMultiShades}
                  disabled={selectedShadesList.length === 0}
                  style={[
                    styles.applyBtn,
                    { backgroundColor: selectedShadesList.length > 0 ? '#7C3AED' : '#CBD5E0' },
                  ]}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
                    ✅ Apply ({selectedShadesList.length}) Shades
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  backText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  tabBar: {
    flexDirection: 'row',
    padding: 6,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabBtnActive: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabBtnText: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  scrollContent: {
    flex: 1,
    padding: 16,
  },
  sectionCard: {
    borderRadius: 12,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  machineRow: {
    flexDirection: 'row',
    gap: 8,
  },
  machineBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  machineBtnTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  machineBtnSub: {
    fontSize: 10,
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  extraM2Toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  timerCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  timerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  timerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  timerSub: {
    fontSize: 12,
    marginTop: 3,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  formatCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  formatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  formatTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  formatSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  springsCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  springsCountText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 8,
    gap: 8,
  },
  rowHeaderCol: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  headRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    marginBottom: 6,
    gap: 8,
    borderBottomWidth: 1,
  },
  headRowHeaderCol: {
    fontSize: 11,
    fontWeight: '700',
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    width: '100%',
  },
  shadeCompoundBox: {
    flex: 1,
    minWidth: 0,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  shadeCompoundInput: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    paddingHorizontal: 10,
    paddingVertical: 0,
    fontSize: 14,
    borderWidth: 0,
  },
  shadeDropdownBtn: {
    width: 36,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
  },
  springInput: {
    width: 72,
    minWidth: 72,
    maxWidth: 72,
    height: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 4,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  deleteRowBtn: {
    width: 32,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacerBtn: {
    width: 32,
    height: 42,
  },
  addBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: 4,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  sectionSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  summaryText: {
    fontSize: 13,
  },
  dollyChoiceBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E0',
  },
  dollyChoiceText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#4A5568',
  },
  headCard: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  headCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headCardTitle: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  headSumBadge: {
    fontSize: 12,
  },
  photoCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  uploadBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBoxText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  imagePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  parchiThumb: {
    width: 90,
    height: 90,
    borderRadius: 8,
  },
  reuploadBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 8,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  dashCard: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  mBreakdownCard: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyBox: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  taskItemCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  taskItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  machineTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  machineTagText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  taskOperator: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  viewParchiBtn: {
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  shadesSummaryBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  parchiRecordCard: {
    flexDirection: 'row',
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  parchiThumbWrapper: {
    position: 'relative',
    width: 68,
    height: 68,
    borderRadius: 8,
    overflow: 'hidden',
  },
  parchiRecordThumb: {
    width: 68,
    height: 68,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  parchiZoomBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 2,
    alignItems: 'center',
  },
  parchiMissingCard: {
    flexDirection: 'row',
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  smallActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  photoModalContent: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: 14,
    padding: 16,
  },
  fullParchiImage: {
    width: '100%',
    height: 400,
    borderRadius: 8,
  },
  machineBadgeLarge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  shadeModalBox: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  shadeModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shadeModalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadeSearchInput: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  rangeTabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
    justifyContent: 'center',
  },
  shadesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
  },
  shadeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadeChipText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  addHeadShadeBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  addHeadShadeBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  modeTabBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiSelectBanner: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  multiApplyBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: 1,
    marginTop: 8,
  },
  applyBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
});
