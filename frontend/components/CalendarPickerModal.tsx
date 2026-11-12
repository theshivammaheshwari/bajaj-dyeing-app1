import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import {
  getTodayDateString,
  isValidDateString,
  formatDisplayDate,
  addDaysToDate,
} from '../lib/date-utils';

interface CalendarPickerModalProps {
  visible: boolean;
  onClose: () => void;
  value: string; // YYYY-MM-DD or ''
  onSelectDate: (date: string) => void;
  title?: string;
  allowClear?: boolean; // Show "Show All / Clear" button (e.g. for filters)
  onClear?: () => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function CalendarPickerModal({
  visible,
  onClose,
  value,
  onSelectDate,
  title = 'Select Date (तारीख चुनें)',
  allowClear = false,
  onClear,
}: CalendarPickerModalProps) {
  const { colors } = useTheme();

  // Parse initial view year and month
  const todayStr = getTodayDateString();
  const initialDate = isValidDateString(value) ? value : todayStr;
  const [initYear, initMonth] = initialDate.split('-').map(Number);

  const [viewYear, setViewYear] = useState<number>(initYear);
  const [viewMonth, setViewMonth] = useState<number>(initMonth); // 1-12

  // Sync view when modal opens or value changes
  useEffect(() => {
    if (visible) {
      const active = isValidDateString(value) ? value : getTodayDateString();
      const [y, m] = active.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m);
    }
  }, [visible, value]);

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const yStr = String(viewYear);
    const mStr = String(viewMonth).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const selected = `${yStr}-${mStr}-${dStr}`;
    onSelectDate(selected);
    onClose();
  };

  const handleQuickSelect = (dateStr: string) => {
    onSelectDate(dateStr);
    onClose();
  };

  const handleClear = () => {
    if (onClear) onClear();
    else onSelectDate('');
    onClose();
  };

  // Generate calendar grid
  // Days in current view month:
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  // Day of week of first day (0 = Sun, 1 = Mon, ..., 6 = Sat):
  const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();

  // Create grid cells
  const gridCells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    gridCells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    gridCells.push(d);
  }

  // Selected date components for comparison
  const hasSelected = isValidDateString(value);
  const [selYear, selMonth, selDay] = hasSelected ? value.split('-').map(Number) : [0, 0, 0];
  const [todayYear, todayMonth, todayDay] = todayStr.split('-').map(Number);

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Header */}
              <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colors.text }]}>📅 {title}</Text>
                  {hasSelected && (
                    <Text style={[styles.subtitle, { color: colors.primary }]}>
                      {formatDisplayDate(value, true)}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.inputBackground }]}>
                  <Text style={[styles.closeBtnText, { color: colors.textSecondary }]}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Quick Jump Shortcuts */}
              <View style={styles.quickBar}>
                <TouchableOpacity
                  style={[styles.quickChip, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                  onPress={() => handleQuickSelect(addDaysToDate(todayStr, -1))}
                >
                  <Text style={[styles.quickChipText, { color: colors.text }]}>Yesterday</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.quickChip,
                    value === todayStr
                      ? { backgroundColor: colors.primary, borderColor: colors.primary }
                      : { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                  ]}
                  onPress={() => handleQuickSelect(todayStr)}
                >
                  <Text
                    style={[
                      styles.quickChipText,
                      { color: value === todayStr ? '#fff' : colors.primary, fontWeight: 'bold' },
                    ]}
                  >
                    ⭐ Today
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickChip, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                  onPress={() => handleQuickSelect(addDaysToDate(todayStr, 1))}
                >
                  <Text style={[styles.quickChipText, { color: colors.text }]}>Tomorrow</Text>
                </TouchableOpacity>

                {allowClear && (
                  <TouchableOpacity
                    style={[styles.quickChip, { backgroundColor: '#FFF5F5', borderColor: '#FEB2B2' }]}
                    onPress={handleClear}
                  >
                    <Text style={[styles.quickChipText, { color: '#C53030', fontWeight: 'bold' }]}>
                      All Dates
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Month & Year Navigation */}
              <View style={styles.monthNavRow}>
                <TouchableOpacity
                  style={[styles.navArrowBtn, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                  onPress={handlePrevMonth}
                >
                  <Text style={[styles.navArrowText, { color: colors.text }]}>◀</Text>
                </TouchableOpacity>

                <View style={styles.monthTitleBox}>
                  <Text style={[styles.monthTitleText, { color: colors.text }]}>
                    {MONTH_NAMES[viewMonth - 1]} {viewYear}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.navArrowBtn, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                  onPress={handleNextMonth}
                >
                  <Text style={[styles.navArrowText, { color: colors.text }]}>▶</Text>
                </TouchableOpacity>
              </View>

              {/* Day of Week Headers */}
              <View style={styles.weekHeaderRow}>
                {DAY_NAMES.map((name, idx) => (
                  <View key={idx} style={styles.weekHeaderCell}>
                    <Text
                      style={[
                        styles.weekHeaderText,
                        { color: idx === 0 || idx === 6 ? colors.danger : colors.textSecondary },
                      ]}
                    >
                      {name}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Calendar Grid */}
              <View style={styles.gridContainer}>
                {gridCells.map((day, idx) => {
                  if (day === null) {
                    return <View key={`empty-${idx}`} style={styles.dayCell} />;
                  }

                  const isSelected =
                    hasSelected &&
                    viewYear === selYear &&
                    viewMonth === selMonth &&
                    day === selDay;

                  const isToday =
                    viewYear === todayYear &&
                    viewMonth === todayMonth &&
                    day === todayDay;

                  return (
                    <TouchableOpacity
                      key={`day-${day}`}
                      style={[
                        styles.dayCell,
                        isToday && !isSelected && [styles.todayCell, { borderColor: colors.primary }],
                        isSelected && [styles.selectedCell, { backgroundColor: colors.primary }],
                      ]}
                      onPress={() => handleSelectDay(day)}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          { color: colors.text },
                          isToday && !isSelected && { color: colors.primary, fontWeight: 'bold' },
                          isSelected && styles.selectedDayText,
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Native web datepicker fallback trigger */}
              {Platform.OS === 'web' && (
                <View style={[styles.webFallbackRow, { borderTopColor: colors.border }]}>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                    Device Calendar:
                  </Text>
                  <input
                    type="date"
                    value={isValidDateString(value) ? value : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        handleQuickSelect(e.target.value);
                      }
                    }}
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderRadius: 6,
                      padding: '4px 8px',
                      fontSize: 12,
                      backgroundColor: colors.inputBackground,
                      color: colors.text,
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  />
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  quickBar: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 12,
    flexWrap: 'wrap',
  },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickChipText: {
    fontSize: 11,
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  navArrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navArrowText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  monthTitleBox: {
    flex: 1,
    alignItems: 'center',
  },
  monthTitleText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  weekHeaderRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekHeaderCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekHeaderText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    minHeight: 210,
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  todayCell: {
    borderWidth: 1.5,
  },
  selectedCell: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  dayText: {
    fontSize: 13,
  },
  selectedDayText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  webFallbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
});

