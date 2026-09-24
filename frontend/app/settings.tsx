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
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getBackendBaseUrl } from '../lib/api-base';
import { useTheme } from '../context/ThemeContext';

const EXPO_PUBLIC_BACKEND_URL = getBackendBaseUrl();

interface RateHistoryItem {
  effective_date: string;
  normal_rate: number;
  rejected_rate: number;
  black_return_rate: number;
  updated_at?: string;
}

export default function Settings() {
  const router = useRouter();
  const { colors } = useTheme();

  const [normalRate, setNormalRate] = useState('8');
  const [rejectedRate, setRejectedRate] = useState('8');
  const [blackReturnRate, setBlackReturnRate] = useState('4');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [history, setHistory] = useState<RateHistoryItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchRates();
  }, []);

  const fetchRates = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/settings/rates`);
      const data = await response.json();
      if (data) {
        setNormalRate(data.normal_rate !== undefined ? String(data.normal_rate) : '8');
        setRejectedRate(data.rejected_rate !== undefined ? String(data.rejected_rate) : '8');
        setBlackReturnRate(data.black_return_rate !== undefined ? String(data.black_return_rate) : '4');
        if (data.effective_date) {
          setEffectiveDate(data.effective_date);
        }
        if (data.history) {
          setHistory(data.history);
        }
      }
    } catch (error) {
      console.error('Error fetching rates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setMessage(null);
    const nRate = parseFloat(normalRate);
    const rRate = parseFloat(rejectedRate);
    const brRate = parseFloat(blackReturnRate);

    if (isNaN(nRate) || nRate < 0) {
      showAlert('Error', 'Please enter a valid rate for Normal Completed Tasks');
      return;
    }
    if (isNaN(rRate) || rRate < 0) {
      showAlert('Error', 'Please enter a valid rate for Rejected Tasks');
      return;
    }
    if (isNaN(brRate) || brRate < 0) {
      showAlert('Error', 'Please enter a valid rate for Black Return Completed');
      return;
    }
    if (!effectiveDate || !effectiveDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      showAlert('Error', 'Please enter a valid Effective Date in YYYY-MM-DD format');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/settings/rates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normal_rate: nRate,
          rejected_rate: rRate,
          black_return_rate: brRate,
          effective_date: effectiveDate.trim(),
        }),
      });

      if (response.ok) {
        showAlert(
          'Success',
          `Payment rates saved successfully starting from ${effectiveDate}! Past daily tasks before this date will keep their previous rates.`
        );
        setMessage({ type: 'success', text: `Rates active from ${effectiveDate} saved!` });
        fetchRates();
      } else {
        const err = await response.json();
        showAlert('Error', err.detail || 'Failed to save rates');
        setMessage({ type: 'error', text: err.detail || 'Failed to save' });
      }
    } catch (error) {
      console.error('Save error:', error);
      showAlert('Error', 'Failed to connect to server');
      setMessage({ type: 'error', text: 'Failed to connect to server' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setNormalRate('8');
    setRejectedRate('8');
    setBlackReturnRate('4');
    setEffectiveDate(new Date().toISOString().split('T')[0]);
  };

  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const nRateNum = parseFloat(normalRate) || 0;
  const rRateNum = parseFloat(rejectedRate) || 0;
  const brRateNum = parseFloat(blackReturnRate) || 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Text style={[styles.backBtnText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>⚙️ Rate Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 12, color: colors.textSecondary }}>Loading settings...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.introCard}>
            <Text style={[styles.introTitle, { color: colors.primary }]}>💰 Dynamic Payment Rates</Text>
            <Text style={[styles.introSubtitle, { color: colors.textSecondary }]}>
              Set labor rates with an Effective Date. <Text style={{ fontWeight: 'bold' }}>Past daily tasks before the effective date will preserve their original rates</Text> and won't be modified.
            </Text>
          </View>

          {message && (
            <View
              style={[
                styles.messageBanner,
                { backgroundColor: message.type === 'success' ? '#F0FFF4' : '#FFF5F5', borderColor: message.type === 'success' ? colors.success : colors.danger },
              ]}
            >
              <Text style={{ color: message.type === 'success' ? colors.success : colors.danger, fontWeight: 'bold' }}>
                {message.text}
              </Text>
            </View>
          )}

          {/* Form Fields */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Effective Start Date */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldHeader}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>📅 Apply Starting From Date (Effective Date)</Text>
              </View>
              <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
                New rates will apply only on and after this date. Older tasks will keep their historical rate.
              </Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={effectiveDate}
                  onChangeText={setEffectiveDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            {/* Field 1: Normal Completed */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldHeader}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>1. Normal Completed Tasks (Full Rate)</Text>
                <View style={[styles.badge, { backgroundColor: '#F0FFF4' }]}>
                  <Text style={{ color: colors.success, fontSize: 11, fontWeight: 'bold' }}>Standard</Text>
                </View>
              </View>
              <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
                Applied to all normal lots that are marked as Completed.
              </Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
                <Text style={[styles.currencyPrefix, { color: colors.primary }]}>₹</Text>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={normalRate}
                  onChangeText={setNormalRate}
                  keyboardType="numeric"
                  placeholder="8.0"
                  placeholderTextColor={colors.textSecondary}
                />
                <Text style={[styles.unitSuffix, { color: colors.textSecondary }]}>/ kg</Text>
              </View>
            </View>

            {/* Field 2: Rejected Tasks */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldHeader}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>2. Rejected / Damaged Tasks</Text>
                <View style={[styles.badge, { backgroundColor: '#FFF5F5' }]}>
                  <Text style={{ color: colors.danger, fontSize: 11, fontWeight: 'bold' }}>Rejected</Text>
                </View>
              </View>
              <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
                Applied to all lots that are marked as Rejected by the master.
              </Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
                <Text style={[styles.currencyPrefix, { color: colors.primary }]}>₹</Text>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={rejectedRate}
                  onChangeText={setRejectedRate}
                  keyboardType="numeric"
                  placeholder="8.0"
                  placeholderTextColor={colors.textSecondary}
                />
                <Text style={[styles.unitSuffix, { color: colors.textSecondary }]}>/ kg</Text>
              </View>
            </View>

            {/* Field 3: Black Return Completed */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldHeader}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>3. Black Return (Completed)</Text>
                <View style={[styles.badge, { backgroundColor: '#EBF8FF' }]}>
                  <Text style={{ color: colors.secondary, fontSize: 11, fontWeight: 'bold' }}>Special</Text>
                </View>
              </View>
              <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
                Applied when lot contains 'Black return' in shade name and is completed.
              </Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
                <Text style={[styles.currencyPrefix, { color: colors.primary }]}>₹</Text>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={blackReturnRate}
                  onChangeText={setBlackReturnRate}
                  keyboardType="numeric"
                  placeholder="4.0"
                  placeholderTextColor={colors.textSecondary}
                />
                <Text style={[styles.unitSuffix, { color: colors.textSecondary }]}>/ kg</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.resetBtn, { borderColor: colors.border }]}
                onPress={handleResetDefaults}
                disabled={saving}
              >
                <Text style={[styles.resetBtnText, { color: colors.textSecondary }]}>Reset (8, 8, 4)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>💾 Save Rates</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Machine Payout Preview Card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 15 }]}>
            <Text style={[styles.previewTitle, { color: colors.text }]}>📊 Machine Payout Preview (Per Lot)</Text>
            <Text style={[styles.fieldHint, { color: colors.textSecondary, marginBottom: 12 }]}>
              Estimated earning per lot under current configured rates:
            </Text>

            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeaderRow, { backgroundColor: colors.primary }]}>
                <Text style={[styles.th, { flex: 1.2, color: '#fff' }]}>Machine</Text>
                <Text style={[styles.th, { flex: 1, color: '#fff' }]}>Cap (kg)</Text>
                <Text style={[styles.th, { flex: 1.4, color: '#fff' }]}>Normal (₹{nRateNum})</Text>
                <Text style={[styles.th, { flex: 1.4, color: '#fff' }]}>Black Ret (₹{brRateNum})</Text>
              </View>

              {[
                { name: 'M1', cap: 10.5 },
                { name: 'M2, M3, M8, M9', cap: 12.0 },
                { name: 'M4, M10, M11', cap: 6.0 },
                { name: 'M5', cap: 24.0 },
                { name: 'M6, M7', cap: 15.0 },
              ].map((item, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.tableRow,
                    { borderBottomColor: colors.border, backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' },
                  ]}
                >
                  <Text style={[styles.td, { flex: 1.2, fontWeight: 'bold', color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.td, { flex: 1, color: colors.textSecondary }]}>{item.cap} kg</Text>
                  <Text style={[styles.td, { flex: 1.4, color: colors.success, fontWeight: 'bold' }]}>
                    ₹{roundNum(item.cap * nRateNum)}
                  </Text>
                  <Text style={[styles.td, { flex: 1.4, color: colors.secondary, fontWeight: 'bold' }]}>
                    ₹{roundNum(item.cap * brRateNum)}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Rate History Log Card */}
          {history && history.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 15 }]}>
              <Text style={[styles.previewTitle, { color: colors.text }]}>📜 Rate Change History</Text>
              <Text style={[styles.fieldHint, { color: colors.textSecondary, marginBottom: 12 }]}>
                Record of all historical rates and their effective start dates:
              </Text>

              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeaderRow, { backgroundColor: '#4A5568' }]}>
                  <Text style={[styles.th, { flex: 1.2, color: '#fff' }]}>Effective Date</Text>
                  <Text style={[styles.th, { flex: 1, color: '#fff' }]}>Normal</Text>
                  <Text style={[styles.th, { flex: 1, color: '#fff' }]}>Rejected</Text>
                  <Text style={[styles.th, { flex: 1, color: '#fff' }]}>Black Ret</Text>
                </View>

                {history.map((item, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.tableRow,
                      { borderBottomColor: colors.border, backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' },
                    ]}
                  >
                    <Text style={[styles.td, { flex: 1.2, fontWeight: 'bold', color: colors.primary }]}>{item.effective_date}</Text>
                    <Text style={[styles.td, { flex: 1, color: colors.text }]}>₹{item.normal_rate}/kg</Text>
                    <Text style={[styles.td, { flex: 1, color: colors.text }]}>₹{item.rejected_rate}/kg</Text>
                    <Text style={[styles.td, { flex: 1, color: colors.text }]}>₹{item.black_return_rate}/kg</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function roundNum(num: number) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  introCard: {
    marginBottom: 16,
  },
  introTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  introSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: 'center',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  fieldHint: {
    fontSize: 12,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    height: '100%',
  },
  unitSuffix: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  resetBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1.5,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  table: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  tableHeaderRow: {
    paddingVertical: 10,
  },
  th: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  td: {
    fontSize: 13,
    textAlign: 'center',
  },
});
