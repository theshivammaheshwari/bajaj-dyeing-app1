import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getBackendBaseUrl } from '../lib/api-base';
import { useTheme } from '../context/ThemeContext';

const EXPO_PUBLIC_BACKEND_URL = getBackendBaseUrl();

interface DyeItem {
  dye_name: string;
  quantity: number;
}

interface Shade {
  id: string;
  shade_number: string;
  original_weight: number;
  program_number: string;
  rc: string;
  dyes: DyeItem[];
}

export default function ShadeDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const shadeId = params.shadeId as string;
  const { colors } = useTheme();

  const [shade, setShade] = useState<Shade | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (shadeId) {
      fetchShade();
    }
  }, [shadeId]);

  const fetchShade = async () => {
    try {
      const response = await fetch(
        `${EXPO_PUBLIC_BACKEND_URL}/api/shades/${shadeId}`
      );
      const data = await response.json();
      setShade(data);
    } catch (error) {
      console.error('Error fetching shade:', error);
      Alert.alert('Error', 'Failed to load shade details');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (Platform.OS === 'web') {
      window.print();
    } else {
      Alert.alert('Print', 'Printing is only supported in the web version.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />
        <View style={styles.centerContent}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading shade details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!shade) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />
        <View style={styles.centerContent}>
          <Text style={[styles.errorText, { color: colors.danger }]}>Shade not found</Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.headerBackground} />
      
      {/* Header - Hidden in Print */}
      <View style={[styles.header, styles.noPrint, { backgroundColor: colors.headerBackground, borderBottomWidth: 1, borderBottomColor: colors.border }, Platform.OS === 'web' && { className: 'no-print' } as any]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLinkWrap}>
          <Text style={[styles.backLink, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Shade Recipe</Text>
        <TouchableOpacity onPress={handlePrint} style={[styles.printButton, { backgroundColor: colors.primary }]}>
          <Text style={styles.printButtonText}>Print</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.printArea}>
          {/* Print Header - Only visible during print */}
          <View style={[styles.onlyPrint, Platform.OS === 'web' && { className: 'only-print' } as any]}>
            <Text style={[styles.printCompanyTitle, { color: '#000' }]}>BAJAJ DYEING UNIT</Text>
            <Text style={[styles.printDocTitle, { color: '#000' }]}>SHADE RECIPE CARD</Text>
          </View>

          {/* Shade Info Card */}
          <View style={[styles.shadeInfoCard, { backgroundColor: colors.card, borderColor: colors.primary }, Platform.OS === 'web' && { className: 'print-card' } as any]}>
            <View style={styles.shadeHeader}>
              <View>
                <Text style={[styles.shadeLabel, { color: colors.textSecondary }]}>Shade Number</Text>
                <Text style={[styles.shadeNumber, { color: colors.primary }]}>#{shade.shade_number}</Text>
              </View>
              <View style={[styles.programBadge, { backgroundColor: colors.badgeBackground }]}>
                <Text style={[styles.programText, { color: colors.text }]}>{shade.program_number || 'P1'}</Text>
              </View>
            </View>

            <View style={styles.infoGrid}>
              <View style={styles.infoCol}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Original Weight</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{shade.original_weight} kg</Text>
              </View>
              <View style={styles.infoCol}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>RC (Reduction Clearing)</Text>
                <Text style={[styles.infoValue, { color: colors.text }, shade.rc === 'Yes' && styles.rcYes]}>
                  {shade.rc || 'No'}
                </Text>
              </View>
              <View style={styles.infoCol}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Dye Count</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{shade.dyes.length} items</Text>
              </View>
            </View>
          </View>

          {/* Recipe Table */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recipe Formulation</Text>
            <View style={[styles.table, { borderColor: colors.border, borderWidth: 1 }, Platform.OS === 'web' && { className: 'print-card' } as any]}>
              <View style={[styles.tableHeader, { backgroundColor: colors.inputBackground, borderBottomColor: colors.border }]}>
                <Text style={[styles.columnHeader, { color: colors.text, flex: 3 }]}>Dye/Chemical Name</Text>
                <Text style={[styles.columnHeader, { color: colors.text, flex: 2, textAlign: 'center' }]}>Quantity (gm)</Text>
                <Text style={[styles.columnHeader, { color: colors.text, flex: 2, textAlign: 'center' }]}>Per Kg (gm/kg)</Text>
              </View>

              {shade.dyes.map((dye, index) => (
                <View key={index} style={[styles.tableRow, { borderBottomColor: colors.border, backgroundColor: index % 2 === 0 ? colors.card : 'transparent' }]}>
                  <Text style={[styles.tableCell, { color: colors.text, flex: 3, fontWeight: '500' }]}>{dye.dye_name}</Text>
                  <Text style={[styles.tableCell, { color: colors.primary, flex: 2, textAlign: 'center', fontWeight: 'bold' }]}>
                    {dye.quantity.toFixed(3)}
                  </Text>
                  <Text style={[styles.tableCell, { color: colors.textSecondary, flex: 2, textAlign: 'center' }]}>
                    {(dye.quantity / shade.original_weight).toFixed(3)}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Print Footer */}
          <View style={[styles.onlyPrint, Platform.OS === 'web' && { className: 'only-print' } as any]}>
             <View style={styles.printSignatureRow}>
                <View style={[styles.signatureBox, { borderTopColor: '#000' }]}>
                  <Text style={[styles.signatureLabel, { color: '#000' }]}>Dyeing Master</Text>
                </View>
                <View style={[styles.signatureBox, { borderTopColor: '#000' }]}>
                  <Text style={[styles.signatureLabel, { color: '#000' }]}>Production Manager</Text>
                </View>
             </View>
             <Text style={[styles.printTimestamp, { color: '#000' }]}>Generated on: {new Date().toLocaleString()}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backLinkWrap: {
    padding: 4,
  },
  backLink: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  printButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  printButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  printArea: {
    width: '100%',
  },
  shadeInfoCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
  },
  shadeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  shadeLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  shadeNumber: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  programBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  programText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.1)',
    paddingTop: 16,
  },
  infoCol: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  rcYes: {
    color: '#9C27B0',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  table: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
  },
  columnHeader: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  tableRow: {
    flexDirection: 'row',
    padding: 14,
    borderBottomWidth: 1,
  },
  tableCell: {
    fontSize: 15,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  errorText: {
    fontSize: 18,
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  // Print CSS Simulation
  onlyPrint: {
    display: Platform.OS === 'web' ? 'none' : 'none', // Default hidden in app
  },
  noPrint: {
    // Default visible
  },
  // Actual Print CSS via +html.tsx or injected styles
  printCompanyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  printDocTitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    textDecorationLine: 'underline',
  },
  printSignatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 50,
    paddingHorizontal: 20,
  },
  signatureBox: {
    width: 150,
    borderTopWidth: 1,
    alignItems: 'center',
    paddingTop: 8,
  },
  signatureLabel: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  printTimestamp: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 30,
    opacity: 0.5,
  },
});
