import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Modal,
    Pressable,
    Platform,
} from 'react-native';
import { MONTHS } from '../constants';

interface DateFilterModalProps {
    isVisible: boolean;
    onClose: () => void;
    selectedYear: number | null;
    setSelectedYear: (year: number | null) => void;
    selectedMonth: number | null;
    setSelectedMonth: (month: number | null) => void;
    selectedDay: number | null;
    setSelectedDay: (day: number | null) => void;
    activeDateFilter: string | null;
    onApply: () => void;
    onClear: () => void;
    theme: any;
}

// Generate years for picker (last 10 years)
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

// Generate days for selected month
const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
};

const DateFilterModal: React.FC<DateFilterModalProps> = ({
    isVisible,
    onClose,
    selectedYear,
    setSelectedYear,
    selectedMonth,
    setSelectedMonth,
    selectedDay,
    setSelectedDay,
    activeDateFilter,
    onApply,
    onClear,
    theme,
}) => {
    const days = selectedYear && selectedMonth !== null
        ? Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }, (_, i) => i + 1)
        : [];

    return (
        <Modal
            visible={isVisible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable
                style={styles.modalOverlay}
                onPress={onClose}
            >
                <View style={[styles.dateModal, { backgroundColor: theme.card }]}>
                    <Text style={[styles.dateModalTitle, { color: theme.text }]}>Filter by Date</Text>
                    <Text style={[styles.dateModalSubtitle, { color: theme.textSecondary }]}>
                        Select year, optionally month and day
                    </Text>

                    {/* Year Picker */}
                    <Text style={[styles.pickerLabel, { color: theme.text }]}>Year</Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.pickerScroll}
                    >
                        {years.map((year) => (
                            <TouchableOpacity
                                key={year}
                                style={[
                                    styles.pickerItem,
                                    { backgroundColor: theme.border },
                                    selectedYear === year && styles.pickerItemActive,
                                ]}
                                onPress={() => {
                                    setSelectedYear(selectedYear === year ? null : year);
                                    if (selectedYear !== year) {
                                        setSelectedMonth(null);
                                        setSelectedDay(null);
                                    }
                                }}
                            >
                                <Text
                                    style={[
                                        styles.pickerItemText,
                                        { color: theme.text },
                                        selectedYear === year && styles.pickerItemTextActive,
                                    ]}
                                >
                                    {year}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* Month Picker */}
                    {selectedYear && (
                        <>
                            <Text style={[styles.pickerLabel, { color: theme.text }]}>Month (Optional)</Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.pickerScroll}
                            >
                                {MONTHS.map((month, idx) => (
                                    <TouchableOpacity
                                        key={month}
                                        style={[
                                            styles.pickerItem,
                                            { backgroundColor: theme.border },
                                            selectedMonth === idx && styles.pickerItemActive,
                                        ]}
                                        onPress={() => {
                                            setSelectedMonth(selectedMonth === idx ? null : idx);
                                            if (selectedMonth !== idx) setSelectedDay(null);
                                        }}
                                    >
                                        <Text
                                            style={[
                                                styles.pickerItemText,
                                                { color: theme.text },
                                                selectedMonth === idx && styles.pickerItemTextActive,
                                            ]}
                                        >
                                            {month.slice(0, 3)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </>
                    )}

                    {/* Day Picker */}
                    {selectedYear && selectedMonth !== null && (
                        <>
                            <Text style={styles.pickerLabel}>Day (Optional)</Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.pickerScroll}
                            >
                                {days.map((day) => (
                                    <TouchableOpacity
                                        key={day}
                                        style={[
                                            styles.pickerItemSmall,
                                            selectedDay === day && styles.pickerItemActive,
                                        ]}
                                        onPress={() => setSelectedDay(selectedDay === day ? null : day)}
                                    >
                                        <Text
                                            style={[
                                                styles.pickerItemText,
                                                selectedDay === day && styles.pickerItemTextActive,
                                            ]}
                                        >
                                            {day}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </>
                    )}

                    {/* Actions */}
                    <View style={styles.dateModalActions}>
                        <TouchableOpacity
                            style={styles.dateModalCancelBtn}
                            onPress={onClose}
                        >
                            <Text style={styles.dateModalCancelText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.dateModalApplyBtn,
                                !selectedYear && styles.dateModalApplyBtnDisabled,
                            ]}
                            onPress={onApply}
                            disabled={!selectedYear}
                        >
                            <Text style={styles.dateModalApplyText}>Apply Filter</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Clear Button */}
                    {activeDateFilter && (
                        <TouchableOpacity
                            style={styles.dateModalClearBtn}
                            onPress={() => {
                                onClear();
                                onClose();
                            }}
                        >
                            <Text style={styles.dateModalClearText}>Clear Date Filter</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </Pressable>
        </Modal>
    );
};

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    dateModal: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        paddingHorizontal: 20,
    },
    dateModalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 4,
    },
    dateModalSubtitle: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 20,
    },
    pickerLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 10,
        marginTop: 8,
    },
    pickerScroll: {
        marginBottom: 12,
    },
    pickerItem: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        marginRight: 10,
    },
    pickerItemSmall: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: '#F3F4F6',
        marginRight: 8,
        minWidth: 44,
        alignItems: 'center',
    },
    pickerItemActive: {
        backgroundColor: '#059669',
    },
    pickerItemText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
    },
    pickerItemTextActive: {
        color: '#FFFFFF',
    },
    dateModalActions: {
        flexDirection: 'row',
        marginTop: 24,
        gap: 12,
    },
    dateModalCancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
    },
    dateModalCancelText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
    },
    dateModalApplyBtn: {
        flex: 2,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#059669',
        alignItems: 'center',
    },
    dateModalApplyBtnDisabled: {
        backgroundColor: '#9CA3AF',
    },
    dateModalApplyText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    dateModalClearBtn: {
        marginTop: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    dateModalClearText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#DC2626',
    },
});

export default DateFilterModal;
