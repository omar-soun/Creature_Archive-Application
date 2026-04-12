import React, { useState, useEffect } from 'react';
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
    /** Committed year — used to pre-populate the modal when re-opened */
    initialYear: number | null;
    /** Committed month — used to pre-populate the modal when re-opened */
    initialMonth: number | null;
    /** Committed day — used to pre-populate the modal when re-opened */
    initialDay: number | null;
    activeDateFilter: string | null;
    /** Called with (year, month, day) when user confirms. Never called on Cancel. */
    onApply: (year: number | null, month: number | null, day: number | null) => void;
    onClear: () => void;
    theme: any;
}

// Generate years for picker (last 10 years)
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

const getDaysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();

const DateFilterModal: React.FC<DateFilterModalProps> = ({
    isVisible,
    onClose,
    initialYear,
    initialMonth,
    initialDay,
    activeDateFilter,
    onApply,
    onClear,
    theme,
}) => {
    // ============================================
    // DRAFT STATE — local to the modal.
    // Initialized from committed values on open.
    // Discarded on Cancel.
    // ============================================
    const [draftYear, setDraftYear] = useState<number | null>(null);
    const [draftMonth, setDraftMonth] = useState<number | null>(null);
    const [draftDay, setDraftDay] = useState<number | null>(null);

    // Sync draft to committed values every time the modal opens
    useEffect(() => {
        if (isVisible) {
            setDraftYear(initialYear);
            setDraftMonth(initialMonth);
            setDraftDay(initialDay);
        }
    }, [isVisible]);

    const days =
        draftYear && draftMonth !== null
            ? Array.from(
                  { length: getDaysInMonth(draftYear, draftMonth) },
                  (_, i) => i + 1,
              )
            : [];

    const handleApply = () => {
        onApply(draftYear, draftMonth, draftDay);
    };

    const handleCancel = () => {
        // Do NOT commit draft — just close. The draft resets on next open via useEffect.
        onClose();
    };

    return (
        <Modal
            visible={isVisible}
            transparent
            animationType="fade"
            onRequestClose={handleCancel}
        >
            <Pressable style={styles.modalOverlay} onPress={handleCancel}>
                <View style={[styles.dateModal, { backgroundColor: theme.card }]}>
                    <Text style={[styles.dateModalTitle, { color: theme.text }]}>
                        Filter by Date
                    </Text>
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
                                    draftYear === year && styles.pickerItemActive,
                                ]}
                                onPress={() => {
                                    if (draftYear === year) {
                                        setDraftYear(null);
                                        setDraftMonth(null);
                                        setDraftDay(null);
                                    } else {
                                        setDraftYear(year);
                                        setDraftMonth(null);
                                        setDraftDay(null);
                                    }
                                }}
                            >
                                <Text
                                    style={[
                                        styles.pickerItemText,
                                        { color: theme.text },
                                        draftYear === year && styles.pickerItemTextActive,
                                    ]}
                                >
                                    {year}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* Month Picker */}
                    {draftYear && (
                        <>
                            <Text style={[styles.pickerLabel, { color: theme.text }]}>
                                Month (Optional)
                            </Text>
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
                                            draftMonth === idx && styles.pickerItemActive,
                                        ]}
                                        onPress={() => {
                                            if (draftMonth === idx) {
                                                setDraftMonth(null);
                                                setDraftDay(null);
                                            } else {
                                                setDraftMonth(idx);
                                                setDraftDay(null);
                                            }
                                        }}
                                    >
                                        <Text
                                            style={[
                                                styles.pickerItemText,
                                                { color: theme.text },
                                                draftMonth === idx && styles.pickerItemTextActive,
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
                    {draftYear && draftMonth !== null && (
                        <>
                            <Text style={[styles.pickerLabel, { color: theme.text }]}>
                                Day (Optional)
                            </Text>
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
                                            { backgroundColor: theme.border },
                                            draftDay === day && styles.pickerItemActive,
                                        ]}
                                        onPress={() =>
                                            setDraftDay(draftDay === day ? null : day)
                                        }
                                    >
                                        <Text
                                            style={[
                                                styles.pickerItemText,
                                                { color: theme.text },
                                                draftDay === day && styles.pickerItemTextActive,
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
                            onPress={handleCancel}
                        >
                            <Text style={styles.dateModalCancelText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.dateModalApplyBtn,
                                !draftYear && styles.dateModalApplyBtnDisabled,
                            ]}
                            onPress={handleApply}
                            disabled={!draftYear}
                        >
                            <Text style={styles.dateModalApplyText}>Apply Filter</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Clear existing filter */}
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
