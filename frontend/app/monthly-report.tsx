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
} from 'react-native';
import { useRouter } from 'expo-router';
import { getBackendBaseUrl } from '../lib/api-base';
import { useTheme } from '../context/ThemeContext';

const EXPO_PUBLIC_BACKEND_URL = getBackendBaseUrl();

interface MonthProductionItem {
  month_key: string;
  month_name: string;
  year: string;
  completed_2ply_kg: number;
  completed_3ply_kg: number;
  completed_total_kg: number;
  completed_springs_2ply: number;
  completed_springs_3ply: number;
  completed_batches: number;
  rejected_2ply_kg: number;
  rejected_3ply_kg: number;
  rejected_total_kg: number;
  rejected_springs_2ply: number;
  rejected_springs_3ply: number;
  rejected_batches: number;
  pending_total_kg: number;
  pending_batches: number;
  total_processed_kg: number;
  rejection_rate_percent: number;
  dm1_completed_kg: number;
  dm2_completed_kg: number;
  dm1_rejected_kg: number;
  dm2_rejected_kg: number;
}

interface MonthlyReportData {
  selected_year: string;
  available_years: string[];
  selected_master: string;
  grand_summary: {
    total_completed_kg: number;
    total_completed_2ply_kg: number;
    total_completed_3ply_kg: number;
    total_rejected_kg: number;
    total_rejected_2ply_kg: number;
    total_rejected_3ply_kg: number;
    total_processed_kg: number;
    total_completed_batches: number;
    total_rejected_batches: number;
    rejection_rate_percent: number;
    total_months: number;
  };
  months: MonthProductionItem[];
}

export default function MonthlyReport() {
  const router = useRouter();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<MonthlyReportData | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMaster, setSelectedMaster] = useState<'all' | 'user1' | 'user2'>('all');

  useEffect(() => {
    fetchReport();
  }, [selectedYear, selectedMaster]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedYear && selectedYear !== 'all') params.append('year', selectedYear);
      if (selectedMaster && selectedMaster !== 'all') params.append('master', selectedMaster);

      const url = `${EXPO_PUBLIC_BACKEND_URL}/api/reports/monthly-production?${params.toString()}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setReportData(data);
      } else {
        showAlert('Error', 'Failed to load monthly report');
      }
    } catch (error) {
      console.error('Error fetching monthly report:', error);
      showAlert('Error', 'Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const handlePrint = () => {
    if (Platform.OS !== 'web') {
      showAlert('Info', 'Print is supported in web view.');
      return;
    }

    if (!reportData || reportData.months.length === 0) {
      showAlert('Notice', 'No report data to print.');
      return;
    }

    const summary = reportData.grand_summary;
    const printHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Monthly Dyeing Report - Bajaj Dyeing Unit</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 24px; color: #1a202c; }
    .header { text-align: center; border-bottom: 2px solid #2b6cb0; padding-bottom: 12px; margin-bottom: 20px; }
    .header h1 { margin: 0; color: #2b6cb0; font-size: 24px; }
    .header p { margin: 4px 0 0; color: #718096; font-size: 13px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; background: #f7fafc; }
    .kpi-label { font-size: 11px; color: #718096; text-transform: uppercase; font-weight: bold; }
    .kpi-val { font-size: 18px; font-weight: bold; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    th { background: #2b6cb0; color: #fff; padding: 8px 6px; text-align: center; }
    td { padding: 8px 6px; border-bottom: 1px solid #e2e8f0; text-align: center; }
    tr:nth-child(even) { background: #f8fafc; }
    .highlight-2p { color: #2b6cb0; font-weight: bold; }
    .highlight-3p { color: #6b46c1; font-weight: bold; }
    .highlight-rej { color: #e53e3e; font-weight: bold; }
    .highlight-tot { font-weight: bold; color: #22543d; }
    .footer { margin-top: 30px; font-size: 11px; color: #a0aec0; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Bajaj Dyeing Unit</h1>
    <p>Monthly Dyeing Consumption & Production Report (in KGs)</p>
    <p>Year: ${selectedYear === 'all' ? 'All Time' : selectedYear} | Master: ${selectedMaster === 'all' ? 'All Masters' : selectedMaster === 'user1' ? 'Master 1' : 'Master 2'} | Generated on ${new Date().toLocaleString()}</p>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Completed Dyeing</div>
      <div class="kpi-val" style="color: #22543d;">${summary.total_completed_kg.toLocaleString()} kg</div>
      <small>${summary.total_completed_batches} lots</small>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">2-PLY Volume</div>
      <div class="kpi-val" style="color: #2b6cb0;">${summary.total_completed_2ply_kg.toLocaleString()} kg</div>
      <small>${summary.total_completed_kg > 0 ? Math.round((summary.total_completed_2ply_kg / summary.total_completed_kg) * 100) : 0}%</small>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">3-PLY Volume</div>
      <div class="kpi-val" style="color: #6b46c1;">${summary.total_completed_3ply_kg.toLocaleString()} kg</div>
      <small>${summary.total_completed_kg > 0 ? Math.round((summary.total_completed_3ply_kg / summary.total_completed_kg) * 100) : 0}%</small>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Rejected / Loss</div>
      <div class="kpi-val" style="color: #e53e3e;">${summary.total_rejected_kg.toLocaleString()} kg</div>
      <small>${summary.rejection_rate_percent}% rejection rate</small>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Month</th>
        <th>Completed Total</th>
        <th>2-PLY (kg)</th>
        <th>3-PLY (kg)</th>
        <th>Rejected (kg)</th>
        <th>Rej %</th>
        <th>Lots (Done/Rej)</th>
      </tr>
    </thead>
    <tbody>
      ${reportData.months.map(m => `
        <tr>
          <td style="font-weight: bold;">${m.month_name}</td>
          <td class="highlight-tot">${m.completed_total_kg.toLocaleString()} kg</td>
          <td class="highlight-2p">${m.completed_2ply_kg.toLocaleString()} kg</td>
          <td class="highlight-3p">${m.completed_3ply_kg.toLocaleString()} kg</td>
          <td class="highlight-rej">${m.rejected_total_kg > 0 ? `${m.rejected_total_kg.toLocaleString()} kg` : '-'}</td>
          <td>${m.rejection_rate_percent > 0 ? `${m.rejection_rate_percent}%` : '0%'}</td>
          <td>${m.completed_batches} / ${m.rejected_batches}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    Bajaj Dyeing Unit Management System
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
      }, 500);
    }
  };

  const grandSummary = reportData?.grand_summary;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backBtnText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>📊 Monthly Dyeing Details</Text>
        <TouchableOpacity onPress={handlePrint} style={[styles.printBtn, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.printBtnText, { color: colors.primary }]}>🖨️ Print</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Bar */}
      <View style={[styles.filterContainer, { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        {/* Year Filter */}
        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Year:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                { backgroundColor: selectedYear === 'all' ? colors.primary : colors.inputBackground, borderColor: colors.border },
              ]}
              onPress={() => setSelectedYear('all')}
            >
              <Text style={[styles.filterChipText, { color: selectedYear === 'all' ? '#fff' : colors.text }]}>
                All Years
              </Text>
            </TouchableOpacity>

            {reportData?.available_years?.map(y => (
              <TouchableOpacity
                key={y}
                style={[
                  styles.filterChip,
                  { backgroundColor: selectedYear === y ? colors.primary : colors.inputBackground, borderColor: colors.border },
                ]}
                onPress={() => setSelectedYear(y)}
              >
                <Text style={[styles.filterChipText, { color: selectedYear === y ? '#fff' : colors.text }]}>
                  {y}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Master Filter */}
        <View style={[styles.filterRow, { marginTop: 8 }]}>
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Master:</Text>
          <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                { flex: 1, backgroundColor: selectedMaster === 'all' ? '#2D3748' : colors.inputBackground, borderColor: colors.border },
              ]}
              onPress={() => setSelectedMaster('all')}
            >
              <Text style={[styles.filterChipText, { color: selectedMaster === 'all' ? '#fff' : colors.text }]}>
                All Unit
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterChip,
                { flex: 1, backgroundColor: selectedMaster === 'user1' ? '#3182CE' : colors.inputBackground, borderColor: colors.border },
              ]}
              onPress={() => setSelectedMaster('user1')}
            >
              <Text style={[styles.filterChipText, { color: selectedMaster === 'user1' ? '#fff' : colors.text }]}>
                Master 1
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterChip,
                { flex: 1, backgroundColor: selectedMaster === 'user2' ? '#805AD5' : colors.inputBackground, borderColor: colors.border },
              ]}
              onPress={() => setSelectedMaster('user2')}
            >
              <Text style={[styles.filterChipText, { color: selectedMaster === 'user2' ? '#fff' : colors.text }]}>
                Master 2
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 12, color: colors.textSecondary }}>Aggregating monthly dyeing details...</Text>
        </View>
      ) : !reportData || reportData.months.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>📊</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Dyeing Records Found</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            No completed or rejected dyeing tasks recorded for the selected filter.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Top KPI Cards Grid */}
          <View style={styles.kpiContainer}>
            {/* KPI 1: Completed Dyeing Total */}
            <View style={[styles.kpiCard, { backgroundColor: '#F0FFF4', borderColor: '#9AE6B4' }]}>
              <View style={styles.kpiHeader}>
                <Text style={styles.kpiLabel}>📦 Completed Dyeing</Text>
                <View style={[styles.kpiBadge, { backgroundColor: '#C6F6D5' }]}>
                  <Text style={{ color: '#22543D', fontSize: 10, fontWeight: 'bold' }}>Total Output</Text>
                </View>
              </View>
              <Text style={[styles.kpiValue, { color: '#22543D' }]}>
                {grandSummary?.total_completed_kg.toLocaleString()} <Text style={styles.kpiUnit}>kg</Text>
              </Text>
              <Text style={styles.kpiSub}>
                {grandSummary?.total_completed_batches} lots completed across {grandSummary?.total_months} months
              </Text>
            </View>

            {/* KPI 2: 2-PLY Total */}
            <View style={[styles.kpiCard, { backgroundColor: '#EBF8FF', borderColor: '#90CDF4' }]}>
              <View style={styles.kpiHeader}>
                <Text style={styles.kpiLabel}>🧵 2-PLY Volume</Text>
                <View style={[styles.kpiBadge, { backgroundColor: '#BEE3F8' }]}>
                  <Text style={{ color: '#2B6CB0', fontSize: 10, fontWeight: 'bold' }}>
                    {grandSummary && grandSummary.total_completed_kg > 0
                      ? `${Math.round((grandSummary.total_completed_2ply_kg / grandSummary.total_completed_kg) * 100)}%`
                      : '0%'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.kpiValue, { color: '#2B6CB0' }]}>
                {grandSummary?.total_completed_2ply_kg.toLocaleString()} <Text style={styles.kpiUnit}>kg</Text>
              </Text>
              <Text style={styles.kpiSub}>2-PLY yarn dyed</Text>
            </View>

            {/* KPI 3: 3-PLY Total */}
            <View style={[styles.kpiCard, { backgroundColor: '#FAF5FF', borderColor: '#D6BCFA' }]}>
              <View style={styles.kpiHeader}>
                <Text style={styles.kpiLabel}>🧵 3-PLY Volume</Text>
                <View style={[styles.kpiBadge, { backgroundColor: '#E9D8FD' }]}>
                  <Text style={{ color: '#6B46C1', fontSize: 10, fontWeight: 'bold' }}>
                    {grandSummary && grandSummary.total_completed_kg > 0
                      ? `${Math.round((grandSummary.total_completed_3ply_kg / grandSummary.total_completed_kg) * 100)}%`
                      : '0%'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.kpiValue, { color: '#6B46C1' }]}>
                {grandSummary?.total_completed_3ply_kg.toLocaleString()} <Text style={styles.kpiUnit}>kg</Text>
              </Text>
              <Text style={styles.kpiSub}>3-PLY yarn dyed</Text>
            </View>

            {/* KPI 4: Rejected Total */}
            <View style={[styles.kpiCard, { backgroundColor: '#FFF5F5', borderColor: '#FEB2B2' }]}>
              <View style={styles.kpiHeader}>
                <Text style={styles.kpiLabel}>❌ Rejected / Loss</Text>
                <View style={[styles.kpiBadge, { backgroundColor: '#FED7D7' }]}>
                  <Text style={{ color: '#9B2C2C', fontSize: 10, fontWeight: 'bold' }}>
                    {grandSummary?.rejection_rate_percent}% Loss
                  </Text>
                </View>
              </View>
              <Text style={[styles.kpiValue, { color: '#C53030' }]}>
                {grandSummary?.total_rejected_kg.toLocaleString()} <Text style={styles.kpiUnit}>kg</Text>
              </Text>
              <Text style={styles.kpiSub}>
                {grandSummary?.total_rejected_batches} lots rejected
              </Text>
            </View>
          </View>

          {/* Month Wise Details Cards */}
          <Text style={[styles.sectionHeading, { color: colors.text }]}>
            📅 Month-By-Month Production Breakdown
          </Text>

          {reportData.months.map((m, idx) => {
            const totCompleted = m.completed_total_kg || 0;
            const p2Percent = totCompleted > 0 ? (m.completed_2ply_kg / totCompleted) * 100 : 0;
            const p3Percent = totCompleted > 0 ? (m.completed_3ply_kg / totCompleted) * 100 : 0;

            return (
              <View
                key={m.month_key}
                style={[styles.monthCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                {/* Month Title & Output */}
                <View style={styles.monthHeaderRow}>
                  <View>
                    <Text style={[styles.monthTitle, { color: colors.text }]}>{m.month_name}</Text>
                    <Text style={[styles.monthSub, { color: colors.textSecondary }]}>
                      {m.completed_batches} Lots Completed {m.rejected_batches > 0 ? `• ${m.rejected_batches} Rej` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.monthTotalKg, { color: colors.success }]}>
                      {m.completed_total_kg.toLocaleString()} kg
                    </Text>
                    <Text style={[styles.monthTotalLabel, { color: colors.textSecondary }]}>Total Dyed</Text>
                  </View>
                </View>

                {/* Visual Ratio Bar */}
                <View style={styles.ratioBarContainer}>
                  <View style={[styles.ratioBarSegment, { flex: p2Percent || 1, backgroundColor: '#3182CE' }]} />
                  <View style={[styles.ratioBarSegment, { flex: p3Percent || 1, backgroundColor: '#805AD5' }]} />
                  {m.rejected_total_kg > 0 && (
                    <View
                      style={[
                        styles.ratioBarSegment,
                        {
                          flex: (m.rejected_total_kg / (totCompleted + m.rejected_total_kg)) * 100 || 1,
                          backgroundColor: '#E53E3E',
                        },
                      ]}
                    />
                  )}
                </View>

                {/* Ply & Rejection Metrics */}
                <View style={styles.metricsGrid}>
                  {/* 2-PLY */}
                  <View style={[styles.metricBox, { backgroundColor: '#EBF8FF' }]}>
                    <Text style={styles.metricLabel}>2-PLY Output</Text>
                    <Text style={[styles.metricValue, { color: '#2B6CB0' }]}>
                      {m.completed_2ply_kg.toLocaleString()} kg
                    </Text>
                    <Text style={styles.metricSub}>
                      {m.completed_springs_2ply} springs ({Math.round(p2Percent)}%)
                    </Text>
                  </View>

                  {/* 3-PLY */}
                  <View style={[styles.metricBox, { backgroundColor: '#FAF5FF' }]}>
                    <Text style={styles.metricLabel}>3-PLY Output</Text>
                    <Text style={[styles.metricValue, { color: '#6B46C1' }]}>
                      {m.completed_3ply_kg.toLocaleString()} kg
                    </Text>
                    <Text style={styles.metricSub}>
                      {m.completed_springs_3ply} springs ({Math.round(p3Percent)}%)
                    </Text>
                  </View>

                  {/* Rejected */}
                  <View style={[styles.metricBox, { backgroundColor: m.rejected_total_kg > 0 ? '#FFF5F5' : '#F7FAFC' }]}>
                    <Text style={styles.metricLabel}>Rejected Loss</Text>
                    <Text style={[styles.metricValue, { color: m.rejected_total_kg > 0 ? '#C53030' : '#A0AEC0' }]}>
                      {m.rejected_total_kg > 0 ? `${m.rejected_total_kg.toLocaleString()} kg` : '0 kg'}
                    </Text>
                    <Text style={styles.metricSub}>
                      {m.rejected_batches} lots ({m.rejection_rate_percent}%)
                    </Text>
                  </View>
                </View>

                {/* Master Production Breakdown Footer */}
                <View style={[styles.monthFooter, { borderTopColor: colors.border }]}>
                  <View style={styles.masterTagRow}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3182CE', marginRight: 6 }} />
                    <Text style={[styles.masterTagText, { color: colors.textSecondary }]}>
                      DM1: <Text style={{ fontWeight: 'bold', color: colors.text }}>{m.dm1_completed_kg} kg</Text>
                    </Text>
                  </View>
                  <View style={styles.masterTagRow}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#805AD5', marginRight: 6 }} />
                    <Text style={[styles.masterTagText, { color: colors.textSecondary }]}>
                      DM2: <Text style={{ fontWeight: 'bold', color: colors.text }}>{m.dm2_completed_kg} kg</Text>
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  printBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  printBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    width: 60,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
  },
  kpiContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4A5568',
  },
  kpiBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 2,
  },
  kpiUnit: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  kpiSub: {
    fontSize: 11,
    color: '#718096',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  monthCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  monthSub: {
    fontSize: 12,
    marginTop: 2,
  },
  monthTotalKg: {
    fontSize: 20,
    fontWeight: '900',
  },
  monthTotalLabel: {
    fontSize: 11,
  },
  ratioBarContainer: {
    height: 8,
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 14,
    gap: 2,
  },
  ratioBarSegment: {
    height: '100%',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  metricBox: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#718096',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  metricSub: {
    fontSize: 10,
    color: '#718096',
  },
  monthFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  masterTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  masterTagText: {
    fontSize: 12,
  },
});
