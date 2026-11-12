import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import {
  getTodayDateString,
  isValidDateString,
  formatDisplayDate,
  addDaysToDate,
} from '../lib/date-utils';
import CalendarPickerModal from './CalendarPickerModal';

interface DatePickerFieldProps {
  value: string; // YYYY-MM-DD or ''
  onChange: (date: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  onClear?: () => void;
  label?: string;
  compact?: boolean;
  showArrows?: boolean;
  showTodayButton?: boolean;
}

export default function DatePickerField({
  value,
  onChange,
  placeholder = 'Select Date',
  allowClear = false,
  onClear,
  label,
  compact = false,
  showArrows = true,
  showTodayButton = true,
}: DatePickerFieldProps) {
  const { colors } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const todayStr = getTodayDateString();
  const hasValue = isValidDateString(value);

  const handlePrevDay = () => {
    const nextDate = addDaysToDate(hasValue ? value : todayStr, -1);
    onChange(nextDate);
  };

  const handleNextDay = () => {
    const nextDate = addDaysToDate(hasValue ? value : todayStr, 1);
    onChange(nextDate);
  };

  const handleTodayPress = () => {
    onChange(todayStr);
  };

  const displayText = hasValue ? formatDisplayDate(value, true) : placeholder;
  const isToday = hasValue && value === todayStr;

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {label}
        </Text>
      )}

      <View style={styles.controlRow}>
        {showArrows && (
          <TouchableOpacity
            style={[
              styles.arrowBtn,
              compact && styles.compactArrowBtn,
              { backgroundColor: colors.inputBackground, borderColor: colors.border },
            ]}
            onPress={handlePrevDay}
            accessibilityLabel="Previous day"
          >
            <Text style={[styles.arrowText, { color: colors.text }]}>◀</Text>
          </TouchableOpacity>
        )}

        {/* Center Date Trigger Box */}
        <TouchableOpacity
          style={[
            styles.triggerBox,
            compact && styles.compactTriggerBox,
            {
              backgroundColor: colors.inputBackground,
              borderColor: hasValue ? colors.primary : colors.border,
            },
          ]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.7}
        >
          <View style={styles.triggerContent}>
            <Text style={styles.calendarIcon}>📅</Text>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.displayText,
                  compact && styles.compactDisplayText,
                  { color: hasValue ? colors.text : colors.textSecondary },
                  hasValue && { fontWeight: 'bold' },
                ]}
                numberOfLines={1}
              >
                {displayText}
              </Text>
              {hasValue && (
                <Text style={[styles.isoSubText, { color: colors.primary }]}>
                  {value} {isToday ? '• Today' : ''}
                </Text>
              )}
            </View>
            <Text style={[styles.dropdownIcon, { color: colors.primary }]}>▼</Text>
          </View>
        </TouchableOpacity>

        {showArrows && (
          <TouchableOpacity
            style={[
              styles.arrowBtn,
              compact && styles.compactArrowBtn,
              { backgroundColor: colors.inputBackground, borderColor: colors.border },
            ]}
            onPress={handleNextDay}
            accessibilityLabel="Next day"
          >
            <Text style={[styles.arrowText, { color: colors.text }]}>▶</Text>
          </TouchableOpacity>
        )}

        {showTodayButton && !isToday && (
          <TouchableOpacity
            style={[
              styles.todayBtn,
              compact && styles.compactTodayBtn,
              { backgroundColor: colors.primaryLight, borderColor: colors.primary },
            ]}
            onPress={handleTodayPress}
          >
            <Text style={[styles.todayBtnText, { color: colors.primary }]}>Today</Text>
          </TouchableOpacity>
        )}

        {allowClear && hasValue && (
          <TouchableOpacity
            style={[
              styles.clearBtn,
              compact && styles.compactClearBtn,
              { backgroundColor: '#FFF5F5', borderColor: '#FEB2B2' },
            ]}
            onPress={() => {
              if (onClear) onClear();
              else onChange('');
            }}
          >
            <Text style={styles.clearBtnText}>✕ All</Text>
          </TouchableOpacity>
        )}
      </View>

      <CalendarPickerModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        value={value}
        onSelectDate={onChange}
        title={label || 'Select Date (तारीख चुनें)'}
        allowClear={allowClear}
        onClear={onClear}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  arrowBtn: {
    width: 36,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactArrowBtn: {
    width: 30,
    height: 32,
  },
  arrowText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  triggerBox: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  compactTriggerBox: {
    minHeight: 34,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  triggerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarIcon: {
    fontSize: 16,
  },
  displayText: {
    fontSize: 13,
  },
  compactDisplayText: {
    fontSize: 12,
  },
  isoSubText: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 1,
  },
  dropdownIcon: {
    fontSize: 10,
    marginLeft: 4,
  },
  todayBtn: {
    paddingHorizontal: 10,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactTodayBtn: {
    height: 32,
    paddingHorizontal: 8,
  },
  todayBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  clearBtn: {
    paddingHorizontal: 10,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactClearBtn: {
    height: 32,
    paddingHorizontal: 6,
  },
  clearBtnText: {
    fontSize: 11,
    color: '#C53030',
    fontWeight: 'bold',
  },
});

