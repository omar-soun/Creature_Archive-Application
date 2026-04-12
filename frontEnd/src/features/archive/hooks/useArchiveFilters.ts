import { useState } from 'react';
import { LocalJournalEntry } from '../../../core/types';
import { MONTHS } from '../constants';

/**
 * Hook that encapsulates all filter-related state and logic for the Archive screen.
 * Handles class filtering, date filtering, and search filtering.
 *
 * Date filter uses a committed-state model:
 * - selectedYear/Month/Day reflect the APPLIED filter only.
 * - The modal manages its own draft state and calls applyDateFilter(year, month, day)
 *   to commit. Cancel in the modal discards the draft without touching committed state.
 */
const useArchiveFilters = (entries: LocalJournalEntry[]) => {
    // ============================================
    // STATE
    // ============================================
    const [searchQuery, setSearchQuery] = useState('');
    const [activeClassFilter, setActiveClassFilter] = useState('All');
    const [isDateModalOpen, setIsDateModalOpen] = useState(false);

    // Committed date filter (only updated on Apply, never by the modal pickers directly)
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [activeDateFilter, setActiveDateFilter] = useState<string | null>(null);

    // ============================================
    // FILTERING LOGIC
    // ============================================
    const filteredEntries = entries.filter((entry) => {
        // Class filter
        if (activeClassFilter !== 'All' && entry.animalClass !== activeClassFilter) {
            return false;
        }

        // Date filter — uses committed selectedYear/Month/Day only
        if (selectedYear !== null) {
            const entryDate = new Date(entry.capturedAt);
            const entryYear = entryDate.getFullYear();
            const entryMonth = entryDate.getMonth();
            const entryDay = entryDate.getDate();

            if (entryYear !== selectedYear) return false;
            if (selectedMonth !== null && entryMonth !== selectedMonth) return false;
            if (selectedDay !== null && entryDay !== selectedDay) return false;
        }

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            const matchesName = entry.speciesName?.toLowerCase().includes(query);
            const matchesScientific = entry.scientificName?.toLowerCase().includes(query);
            const matchesTags = entry.tags?.some((tag: string) => tag.toLowerCase().includes(query));

            if (!matchesName && !matchesScientific && !matchesTags) {
                return false;
            }
        }

        return true;
    });

    // ============================================
    // HANDLERS
    // ============================================

    // Clear all date filters
    const clearDateFilter = () => {
        setSelectedYear(null);
        setSelectedMonth(null);
        setSelectedDay(null);
        setActiveDateFilter(null);
    };

    /**
     * Commit a date selection from the modal.
     * Called with the modal's final draft values — never called on Cancel.
     */
    const applyDateFilter = (
        year: number | null,
        month: number | null,
        day: number | null,
    ) => {
        if (year) {
            setSelectedYear(year);
            setSelectedMonth(month);
            setSelectedDay(day);

            let label = `${year}`;
            if (month !== null) {
                label = `${MONTHS[month]} ${year}`;
                if (day !== null) {
                    label = `${MONTHS[month]} ${day}, ${year}`;
                }
            }
            setActiveDateFilter(label);
        }
        setIsDateModalOpen(false);
    };

    return {
        // Filter state
        searchQuery,
        setSearchQuery,
        activeClassFilter,
        setActiveClassFilter,
        isDateModalOpen,
        setIsDateModalOpen,

        // Committed date filter values (read-only for modal initial state)
        selectedYear,
        selectedMonth,
        selectedDay,
        activeDateFilter,

        // Computed
        filteredEntries,

        // Actions
        clearDateFilter,
        applyDateFilter,
    };
};

export default useArchiveFilters;
