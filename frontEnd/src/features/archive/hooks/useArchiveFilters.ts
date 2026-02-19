import { useState } from 'react';
import { LocalJournalEntry } from '../../../core/types';
import { MONTHS } from '../constants';

/**
 * Hook that encapsulates all filter-related state and logic for the Archive screen.
 * Handles class filtering, date filtering, and search filtering.
 */
const useArchiveFilters = (entries: LocalJournalEntry[]) => {
    // ============================================
    // STATE
    // ============================================
    const [searchQuery, setSearchQuery] = useState('');
    const [activeClassFilter, setActiveClassFilter] = useState('All');
    const [isDateModalOpen, setIsDateModalOpen] = useState(false);
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

        // Date filter
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

    // Apply date filter
    const applyDateFilter = () => {
        if (selectedYear) {
            let label = `${selectedYear}`;
            if (selectedMonth !== null) {
                label = `${MONTHS[selectedMonth]} ${selectedYear}`;
                if (selectedDay !== null) {
                    label = `${MONTHS[selectedMonth]} ${selectedDay}, ${selectedYear}`;
                }
            }
            setActiveDateFilter(label);
        }
        setIsDateModalOpen(false);
    };

    // ============================================
    // DATE PICKER HELPERS
    // ============================================

    // Generate years for picker (last 10 years)
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

    // Generate days for selected month
    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const days = selectedYear && selectedMonth !== null
        ? Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }, (_, i) => i + 1)
        : [];

    return {
        // Filter state
        searchQuery,
        setSearchQuery,
        activeClassFilter,
        setActiveClassFilter,
        isDateModalOpen,
        setIsDateModalOpen,
        selectedYear,
        setSelectedYear,
        selectedMonth,
        setSelectedMonth,
        selectedDay,
        setSelectedDay,
        activeDateFilter,
        setActiveDateFilter,

        // Computed
        filteredEntries,

        // Date picker helpers
        currentYear,
        years,
        getDaysInMonth,
        days,

        // Actions
        clearDateFilter,
        applyDateFilter,
    };
};

export default useArchiveFilters;
