import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { getBackendBaseUrl } from '../lib/api-base';
import { useTheme } from '../context/ThemeContext';

const EXPO_PUBLIC_BACKEND_URL = getBackendBaseUrl();

export interface BatchRecordItem {
  task_id: string;
  date: string;
  machine: string;
  shade_number: string;
  springs_2ply: number;
  springs_3ply: number;
  total_springs: number;
  weight: number;
  ply2_weight: number;
  ply3_weight: number;
  status: string;
  assigned_to: string;
  type: string;
  completed_at?: string;
  start_time?: string;
  end_time?: string;
}

export interface BatchHistoryData {
  shade_number: string;
  found: boolean;
  last_batch_date: string | null;
  last_batch_machine: string | null;
  last_2ply_date: string | null;
  last_3ply_date: string | null;
  total_batches: number;
  total_2ply_batches: number;
  total_3ply_batches: number;
  total_2ply_springs: number;
  total_3ply_springs: number;
  total_springs: number;
  total_weight: number;
  total_completed_batches: number;
  batches: BatchRecordItem[];
  history_2ply: BatchRecordItem[];
  history_3ply: BatchRecordItem[];
}

interface Props {
  visible: boolean;
  shadeNumber: string;
  initialPlyFilter?: 'all' | '2ply' | '3ply';
  onClose: () => void;
}

export default function ShadeBatchHistoryModal({
  visible,
  shadeNumber,
  initialPlyFilter = 'all',
  onClose,
}: Props) {
  const { colors } = useTheme();
  const [data, setData] = useState<BatchHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | '2ply' | '3ply'>('all');

  useEffect(() => {
    if (visible && shadeNumber) {
      setActiveFilter(initialPlyFilter);
      fetchHistory(shadeNumber);
    } else {
      setData(null);
    }
  }, [visible, shadeNumber, initialPlyFilter]);

  const fetchHistory = async (sn: string) => {
    try {
      setLoading(true);
      const cleanSn = encodeURIComponent(sn.trim().replace(/^#/, ''));
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/shades/batch-history/${cleanSn}`);
      if (response.ok) {
        const res = await response.json();
        setData(res);
      } else {
        setData(null);
      }
    } catch (error) {
      console.error('Error fetching shade batch history:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  const displayBatches = () => {
    if (!data) return [];
    if (activeFilter === '2ply') return data.history_2ply || [];
    if (activeFilter === '3ply') return data.history_3ply || [];
    return data.batches || [];
  };

  const batchesToRender = displayBatches();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.title, { color: colors.text }]}>
                  📜 Shade #{shadeNumber} Batch Record
                </Text>
                <View style={[styles.liveBadge, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.liveBadgeText, { color: colors.primary }]}>History</Text>
                </View>
              </View>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Past dyeing dates & complete 2-PLY / 3-PLY records
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.inputBackground }]}>
              <Text style={[styles.closeBtnText, { color: colors.text }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ marginTop: 10, color: colors.textSecondary }}>Fetching batch records...</Text>
            </View>
          ) : !data || data.total_batches === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>🔍</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Past Batches Found</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Shade #{shadeNumber} has not been dyed in any recorded daily task yet.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollBodyContent}>
              {/* Summary Cards */}
              <View style={styles.summaryGrid}>
                {/* Last Batch Overall */}
                <View style={[styles.summaryCard, { backgroundColor: '#EBF8FF', borderColor: '#BEE3F8' }]}>
                  <Text style={styles.summaryCardLabel}>📅 Last Batch Date</Text>
                  <Text style={[styles.summaryCardValue, { color: '#2B6CB0' }]}>
                    {data.last_batch_date || 'N/A'}
                  </Text>
                  <Text style={styles.summaryCardSub}>
                    {data.last_batch_machine ? `Machine ${data.last_batch_machine}` : 'All Batches'}
                  </Text>
                </View>

                {/* Last 2-PLY Date */}
                <View style={[styles.summaryCard, { backgroundColor: '#F0FFF4', borderColor: '#C6F6D5' }]}>
                  <Text style={styles.summaryCardLabel}>🧵 Last 2-PLY Date</Text>
                  <Text style={[styles.summaryCardValue, { color: '#276749' }]}>
                    {data.last_2ply_date || 'Never'}
                  </Text>
                  <Text style={styles.summaryCardSub}>
                    {data.total_2ply_springs} Springs Total ({data.total_2ply_batches} lots)
                  </Text>
                </View>

                {/* Last 3-PLY Date */}
                <View style={[styles.summaryCard, { backgroundColor: '#FAF5FF', borderColor: '#E9D8FD' }]}>
                  <Text style={styles.summaryCardLabel}>🧵 Last 3-PLY Date</Text>
                  <Text style={[styles.summaryCardValue, { color: '#6B46C1' }]}>
                    {data.last_3ply_date || 'Never'}
                  </Text>
                  <Text style={styles.summaryCardSub}>
                    {data.total_3ply_springs} Springs Total ({data.total_3ply_batches} lots)
                  </Text>
                </View>

                {/* Total Stats */}
                <View style={[styles.summaryCard, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                  <Text style={[styles.summaryCardLabel, { color: colors.primary }]}>📊 Total Batches</Text>
                  <Text style={[styles.summaryCardValue, { color: colors.primary }]}>
                    {data.total_batches} Lots
                  </Text>
                  <Text style={styles.summaryCardSub}>
                    {data.total_springs} springs ({data.total_weight} kg)
                  </Text>
                </View>
              </View>

              {/* Filter Tabs */}
              <View style={[styles.filterBar, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={[
                    styles.filterTab,
                    activeFilter === 'all' && [styles.filterTabActive, { backgroundColor: colors.primary }],
                  ]}
                  onPress={() => setActiveFilter('all')}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      activeFilter === 'all' ? { color: '#fff' } : { color: colors.text },
                    ]}
                  >
                    All Batches ({data.total_batches})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterTab,
                    activeFilter === '2ply' && [styles.filterTabActive, { backgroundColor: '#2B6CB0' }],
                  ]}
                  onPress={() => setActiveFilter('2ply')}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      activeFilter === '2ply' ? { color: '#fff' } : { color: colors.text },
                    ]}
                  >
                    2-PLY Record ({data.total_2ply_batches})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterTab,
                    activeFilter === '3ply' && [styles.filterTabActive, { backgroundColor: '#6B46C1' }],
                  ]}
                  onPress={() => setActiveFilter('3ply')}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      activeFilter === '3ply' ? { color: '#fff' } : { color: colors.text },
                    ]}
                  >
                    3-PLY Record ({data.total_3ply_batches})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Batches Table / List */}
              {batchesToRender.length === 0 ? (
                <View style={[styles.emptyFilterView, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    No batches found for {activeFilter === '2ply' ? '2-PLY' : '3-PLY'}.
                  </Text>
                </View>
              ) : (
                <View style={[styles.tableWrap, { borderColor: colors.border }]}>
                  <View style={[styles.tableHeader, { backgroundColor: '#2D3748' }]}>
                    <Text style={[styles.th, { flex: 1.3, color: '#fff' }]}>Date</Text>
                    <Text style={[styles.th, { flex: 0.9, color: '#fff' }]}>Machine</Text>
                    <Text style={[styles.th, { flex: 1, color: '#fff' }]}>2-PLY</Text>
                    <Text style={[styles.th, { flex: 1, color: '#fff' }]}>3-PLY</Text>
                    <Text style={[styles.th, { flex: 1.1, color: '#fff' }]}>Total (Sp)</Text>
                    <Text style={[styles.th, { flex: 1.1, color: '#fff' }]}>Status</Text>
                  </View>

                  {batchesToRender.map((b, idx) => {
                    const isLatest = idx === 0 && activeFilter === 'all';
                    return (
                      <View
                        key={idx}
                        style={[
                          styles.tableRow,
                          {
                            borderBottomColor: colors.border,
                            backgroundColor: isLatest ? '#FEFCBF' : idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
                          },
                        ]}
                      >
                        <View style={{ flex: 1.3 }}>
                          <Text style={[styles.tdDate, { color: colors.text }]}>{b.date}</Text>
                          {isLatest && (
                            <View style={styles.latestBadge}>
                              <Text style={styles.latestBadgeText}>Latest</Text>
                            </View>
                          )}
                        </View>

                        <View style={{ flex: 0.9, alignItems: 'center' }}>
                          <View style={[styles.machineBadge, { backgroundColor: colors.primaryLight }]}>
                            <Text style={[styles.machineBadgeText, { color: colors.primary }]}>{b.machine}</Text>
                          </View>
                        </View>

                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={[styles.tdValue, { color: b.springs_2ply > 0 ? '#2B6CB0' : colors.textSecondary, fontWeight: b.springs_2ply > 0 ? 'bold' : 'normal' }]}>
                            {b.springs_2ply} sp
                          </Text>
                          {b.ply2_weight > 0 ? (
                            <Text style={styles.tdSubWeight}>{b.ply2_weight}kg</Text>
                          ) : null}
                        </View>

                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={[styles.tdValue, { color: b.springs_3ply > 0 ? '#6B46C1' : colors.textSecondary, fontWeight: b.springs_3ply > 0 ? 'bold' : 'normal' }]}>
                            {b.springs_3ply} sp
                          </Text>
                          {b.ply3_weight > 0 ? (
                            <Text style={styles.tdSubWeight}>{b.ply3_weight}kg</Text>
                          ) : null}
                        </View>

                        <View style={{ flex: 1.1, alignItems: 'center' }}>
                          <Text style={[styles.tdTotalValue, { color: colors.text }]}>{b.total_springs} sp</Text>
                          {b.weight > 0 && <Text style={styles.tdSubWeight}>{b.weight} kg</Text>}
                        </View>

                        <View style={{ flex: 1.1, alignItems: 'center' }}>
                          <View
                            style={[
                              styles.statusBadge,
                              b.status === 'completed' && { backgroundColor: '#C6F6D5' },
                              b.status === 'rejected' && { backgroundColor: '#FED7D7' },
                              b.status === 'pending' && { backgroundColor: '#FEEBC8' },
                              b.status === 'in-progress' && { backgroundColor: '#BEE3F8' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                b.status === 'completed' && { color: '#22543D' },
                                b.status === 'rejected' && { color: '#742A2A' },
                                b.status === 'pending' && { color: '#7B341E' },
                                b.status === 'in-progress' && { color: '#2B6CB0' },
                              ]}
                            >
                              {b.status === 'completed' ? '✓ Done' : b.status === 'rejected' ? '✕ Rej' : b.status === 'in-progress' ? '⏳ Prog' : '🕒 Pend'}
                            </Text>
                          </View>
                          <Text style={styles.masterTag}>
                            {b.assigned_to === 'user2' ? 'DM2' : 'DM1'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          )}

          {/* Footer Action */}
          <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity style={[styles.doneBtn, { backgroundColor: colors.primary }]} onPress={onClose}>
              <Text style={styles.doneBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '90%',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  liveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  centerContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 400,
  },
  scrollBody: {
    flex: 1,
  },
  scrollBodyContent: {
    padding: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  summaryCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 4,
  },
  summaryCardValue: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  summaryCardSub: {
    fontSize: 11,
    color: '#718096',
  },
  filterBar: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 14,
    gap: 6,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  tableWrap: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  th: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  tdDate: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  latestBadge: {
    backgroundColor: '#D69E2E',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  latestBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  machineBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  machineBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  tdValue: {
    fontSize: 12,
  },
  tdTotalValue: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  tdSubWeight: {
    fontSize: 10,
    color: '#718096',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  masterTag: {
    fontSize: 9,
    color: '#718096',
    marginTop: 2,
    fontWeight: '600',
  },
  emptyFilterView: {
    padding: 24,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFooter: {
    padding: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  doneBtn: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
