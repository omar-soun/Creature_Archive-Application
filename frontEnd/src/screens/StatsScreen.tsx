import React, { useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    ScrollView,
    Platform,
    Dimensions,
} from 'react-native';
import Svg, { G, Circle, Polyline, Line } from 'react-native-svg';
import BottomTabBar, { TabRoute } from '../components/BottomTabBar';
import statsService from '../services/statsService';
import useJournalEntries from '../hooks/useJournalEntries';

const { width } = Dimensions.get('window');

interface StatsScreenProps {
    onNavigate: (route: TabRoute) => void;
}

const StatsScreen: React.FC<StatsScreenProps> = ({ onNavigate }) => {
    // ============================================
    // STATE & DATA FETCHING
    // ============================================
    const { entries, isLoading } = useJournalEntries();

    const stats = useMemo(() => {
        return statsService.calculateStats(entries);
    }, [entries]);

    const { overview: overviewStats, distribution: speciesDistribution, trend: monthlyTrend, topSpecies } = stats;

    // Check if we have any data
    const hasData = overviewStats.totalObservations > 0;

    // Early return removed to show UI with 0 states as requested

    const maxTrendCount = monthlyTrend.length > 0 ? Math.max(...monthlyTrend.map(d => d.count)) : 10;
    const minTrendCount = monthlyTrend.length > 0 ? Math.min(...monthlyTrend.map(d => d.count)) : 0;

    // ============================================
    // PIE CHART RENDERING (Visual representation)
    // ============================================
    const renderPieChart = () => {
        const size = 160;
        const strokeWidth = 18;
        const center = size / 2;
        const radius = (size - strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        const totalCount = speciesDistribution.reduce((sum, item) => sum + item.count, 0);

        // Import Svg if not already imported (handled at top of file, but ensuring context)
        // We need: Svg, Circle, G from 'react-native-svg'

        let currentAngle = 0;

        return (
            <View style={styles.pieContainer}>
                {/* Pie Chart Visual */}
                <View style={[styles.pieChart, { width: size, height: size }]}>
                    <Svg height={size} width={size} viewBox={`0 0 ${size} ${size}`}>
                        <G rotation="-90" origin={`${center}, ${center}`}>
                            {speciesDistribution.map((item, index) => {
                                const percentage = item.percentage / 100;
                                const strokeDasharray = `${circumference} ${circumference}`;
                                const strokeDashoffset = circumference * (1 - percentage);
                                const angle = currentAngle;
                                currentAngle += percentage * 360;

                                return (
                                    <Circle
                                        key={index}
                                        cx={center}
                                        cy={center}
                                        r={radius}
                                        stroke={item.color}
                                        strokeWidth={strokeWidth}
                                        fill="transparent"
                                        strokeDasharray={strokeDasharray}
                                        strokeDashoffset={strokeDashoffset}
                                        strokeLinecap="round"
                                        rotation={angle}
                                        origin={`${center}, ${center}`}
                                    />
                                );
                            })}
                        </G>
                    </Svg>

                    {/* Center white circle (info) */}
                    <View style={styles.pieCenter}>
                        <Text style={styles.pieCenterValue}>{totalCount}</Text>
                        <Text style={styles.pieCenterLabel}>Total</Text>
                    </View>
                    {totalCount === 0 && (
                        <View style={{ position: 'absolute' }}>
                            <Circle cx={center} cy={center} r={radius} stroke="#F3F4F6" strokeWidth={strokeWidth} fill="transparent" />
                        </View>
                    )}
                </View>

                {/* Legend with counts */}
                <View style={styles.legendContainer}>
                    {speciesDistribution.map((item, index) => (
                        <View key={index} style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                            <Text style={styles.legendName} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.legendCount}>{item.count}</Text>
                        </View>
                    ))}
                </View>
            </View>
        );
    };

    // ============================================
    // DOT CHART RENDERING (6-Month Trend)
    // ============================================
    const renderDotChart = () => {
        const chartHeight = 120;
        const chartWidth = width - 118; // screen padding 40 + card padding 40 + yAxis 30 + margin 8
        const dotSize = 14;
        const range = maxTrendCount - minTrendCount || 1;

        // Calculate points
        // X-axis alignment:
        // Container has paddingHorizontal: 10
        // Item width: 30 (center at 15)
        // Start center: 10 + 15 = 25
        // End center: width - 10 - 15 = width - 25
        // Range: width - 50
        const xStart = 25;
        const xRange = chartWidth - 50;

        const points = monthlyTrend.map((item, index) => {
            const x = xStart + (index / (Math.max(monthlyTrend.length - 1, 1))) * xRange;
            const y = chartHeight - ((item.count - minTrendCount) / range) * chartHeight;
            return { x, y, value: item.count };
        });

        const pointsString = points.map(p => `${p.x},${p.y}`).join(' ');

        return (
            <View style={styles.dotChartWrapper}>
                {/* Chart Area */}
                <View style={styles.dotChartArea}>
                    {/* Y-axis labels */}
                    <View style={styles.yAxis}>
                        <Text style={styles.yAxisLabel}>{maxTrendCount}</Text>
                        <Text style={styles.yAxisLabel}>{Math.round((maxTrendCount + minTrendCount) / 2)}</Text>
                        <Text style={styles.yAxisLabel}>{minTrendCount}</Text>
                    </View>

                    {/* Chart content */}
                    <View style={[styles.chartContent, { height: chartHeight }]}>
                        <Svg height={chartHeight} width={chartWidth}>
                            {/* Grid lines */}
                            <Line x1="0" y1="0" x2={chartWidth} y2="0" stroke="#F3F4F6" strokeWidth="1" />
                            <Line x1="0" y1={chartHeight / 2} x2={chartWidth} y2={chartHeight / 2} stroke="#F3F4F6" strokeWidth="1" />
                            <Line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="#F3F4F6" strokeWidth="1" />

                            {/* Connecting Line */}
                            <Polyline
                                points={pointsString}
                                fill="none"
                                stroke="#D1FAE5"
                                strokeWidth="2"
                            />

                            {/* Dots */}
                            {points.map((p, i) => (
                                <G key={i} x={p.x} y={p.y}>
                                    <Circle r={6} fill="white" stroke="#1B4D3E" strokeWidth={3} />
                                    <Circle r={2} fill="#1B4D3E" />
                                </G>
                            ))}
                        </Svg>
                    </View>
                </View>

                {/* X-axis labels */}
                <View style={styles.xAxisContainer}>
                    {monthlyTrend.map((item, index) => (
                        <View key={index} style={styles.xAxisItem}>
                            <Text style={styles.xAxisMonth}>{item.month}</Text>
                            <Text style={styles.xAxisCount}>{item.count}</Text>
                        </View>
                    ))}
                </View>
            </View>
        );
    };

    // ============================================
    // RENDER
    // ============================================
    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Statistics</Text>
                    <Text style={styles.headerSubtitle}>Your research insights</Text>
                </View>

                {/* Overview Cards */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Overview</Text>
                    <View style={styles.overviewGrid}>
                        <View style={[styles.overviewCard, styles.overviewCardPrimary]}>
                            <Text style={styles.overviewIconPrimary}>📊</Text>
                            <Text style={styles.overviewValuePrimary}>{overviewStats.totalObservations}</Text>
                            <Text style={styles.overviewLabelPrimary}>Total Observations</Text>
                        </View>
                        <View style={styles.overviewCard}>
                            <Text style={styles.overviewIcon}>🦎</Text>
                            <Text style={styles.overviewValue}>{overviewStats.uniqueSpecies}</Text>
                            <Text style={styles.overviewLabel}>Unique Species</Text>
                        </View>
                        <View style={styles.overviewCard}>
                            <Text style={styles.overviewIcon}>🎯</Text>
                            <Text style={styles.overviewValue}>{overviewStats.avgConfidence}%</Text>
                            <Text style={styles.overviewLabel}>Avg. Confidence</Text>
                        </View>
                        <View style={styles.overviewCard}>
                            <Text style={styles.overviewIcon}>📅</Text>
                            <Text style={styles.overviewValue}>{overviewStats.fieldDays}</Text>
                            <Text style={styles.overviewLabel}>Field Days</Text>
                        </View>
                    </View>
                </View>

                {/* Species Distribution Pie Chart */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Species Distribution</Text>
                    <View style={styles.chartCard}>
                        {renderPieChart()}
                    </View>
                </View>

                {/* 6-Month Trend */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>6-Month Trend</Text>
                    <View style={styles.chartCard}>
                        <View style={styles.trendHeader}>
                            <Text style={styles.trendTitle}>Observations over time</Text>
                        </View>
                        {renderDotChart()}
                    </View>
                </View>

                {/* Top Species */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Top Species</Text>
                    <View style={styles.speciesCard}>
                        {topSpecies.length > 0 ? topSpecies.map((species, index) => (
                            <View
                                key={species.name}
                                style={[
                                    styles.speciesRow,
                                    index === topSpecies.length - 1 && styles.speciesRowLast,
                                ]}
                            >
                                <View style={[
                                    styles.speciesRank,
                                    index === 0 && styles.speciesRankFirst,
                                    index === 1 && styles.speciesRankSecond,
                                    index === 2 && styles.speciesRankThird,
                                ]}>
                                    <Text style={[
                                        styles.rankText,
                                        index === 0 && styles.rankTextFirst,
                                        index === 1 && styles.rankTextSecond,
                                        index === 2 && styles.rankTextThird,
                                    ]}>
                                        {index + 1}
                                    </Text>
                                </View>
                                <View style={styles.speciesInfo}>
                                    <Text style={styles.speciesName}>{species.name}</Text>
                                    <View style={styles.progressBar}>
                                        <View
                                            style={[
                                                styles.progressFill,
                                                { width: `${species.percentage}%` },
                                            ]}
                                        />
                                    </View>
                                </View>
                                <View style={styles.speciesCount}>
                                    <Text style={styles.countValue}>{species.count}</Text>
                                    <Text style={styles.countPercent}>{species.percentage}%</Text>
                                </View>
                            </View>
                        )) : (
                            <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 24, marginBottom: 8 }}>🐾</Text>
                                <Text style={{ color: '#6B7280', fontWeight: '500' }}>No species identified yet</Text>
                            </View>
                        )}
                    </View>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            <BottomTabBar currentRoute="Stats" onNavigate={onNavigate} />
        </View>
    );
};

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    scrollContent: {
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: 20,
    },
    header: {
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '700',
        color: '#111827',
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 15,
        color: '#6B7280',
        fontWeight: '500',
        marginTop: 4,
    },

    // Sections
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 14,
    },

    // Overview Grid
    overviewGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    overviewCard: {
        width: (width - 52) / 2,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    overviewCardPrimary: {
        backgroundColor: '#1B4D3E',
    },
    overviewIcon: {
        fontSize: 24,
        marginBottom: 8,
    },
    overviewIconPrimary: {
        fontSize: 24,
        marginBottom: 8,
    },
    overviewValue: {
        fontSize: 28,
        fontWeight: '700',
        color: '#111827',
    },
    overviewValuePrimary: {
        fontSize: 28,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    overviewLabel: {
        fontSize: 13,
        color: '#6B7280',
        fontWeight: '500',
        marginTop: 4,
    },
    overviewLabelPrimary: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.7)',
        fontWeight: '500',
        marginTop: 4,
    },

    // Chart Card
    chartCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },

    // Pie Chart
    pieContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    pieChart: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pieRing: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: 100,
    },
    pieCenter: {
        position: 'absolute',
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    pieCenterValue: {
        fontSize: 22,
        fontWeight: '700',
        color: '#1B4D3E',
    },
    pieCenterLabel: {
        fontSize: 11,
        color: '#6B7280',
        fontWeight: '500',
    },

    // Legend
    legendContainer: {
        flex: 1,
        marginLeft: 24,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 10,
    },
    legendName: {
        flex: 1,
        fontSize: 13,
        color: '#374151',
        fontWeight: '500',
    },
    legendCount: {
        fontSize: 13,
        color: '#111827',
        fontWeight: '700',
        minWidth: 28,
        textAlign: 'right',
    },

    // Trend Header
    trendHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    trendTitle: {
        fontSize: 14,
        color: '#6B7280',
        fontWeight: '500',
    },

    // Dot Chart
    dotChartWrapper: {
        marginBottom: 10,
    },
    dotChartArea: {
        flexDirection: 'row',
    },
    yAxis: {
        width: 30,
        height: 120,
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingRight: 8,
    },
    yAxisLabel: {
        fontSize: 10,
        color: '#9CA3AF',
        fontWeight: '500',
    },
    chartContent: {
        flex: 1,
        position: 'relative',
        marginLeft: 8,
    },
    gridLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: '#F3F4F6',
    },
    dotsContainer: {
        flexDirection: 'row',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'space-between',
        paddingHorizontal: 10,
    },
    dotColumn: {
        alignItems: 'center',
        position: 'relative',
        width: 30,
    },
    connectingLine: {
        position: 'absolute',
        left: 15,
        width: 40,
        backgroundColor: '#D1FAE5',
    },
    trendDot: {
        position: 'absolute',
        borderRadius: 10,
        backgroundColor: '#FFFFFF',
        borderWidth: 3,
        borderColor: '#1B4D3E',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    trendDotInner: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#1B4D3E',
    },
    xAxisContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginLeft: 38,
        marginTop: 12,
        paddingHorizontal: 10,
    },
    xAxisItem: {
        alignItems: 'center',
        width: 30,
    },
    xAxisMonth: {
        fontSize: 11,
        color: '#6B7280',
        fontWeight: '500',
    },
    xAxisCount: {
        fontSize: 12,
        color: '#111827',
        fontWeight: '700',
        marginTop: 2,
    },

    // Top Species
    speciesCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    speciesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    speciesRowLast: {
        borderBottomWidth: 0,
    },
    speciesRank: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    speciesRankFirst: {
        backgroundColor: '#FEF3C7',
    },
    speciesRankSecond: {
        backgroundColor: '#E5E7EB',
    },
    speciesRankThird: {
        backgroundColor: '#FED7AA',
    },
    rankText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#374151',
    },
    rankTextFirst: {
        color: '#D97706',
    },
    rankTextSecond: {
        color: '#6B7280',
    },
    rankTextThird: {
        color: '#EA580C',
    },
    speciesInfo: {
        flex: 1,
    },
    speciesName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 6,
    },
    progressBar: {
        height: 6,
        backgroundColor: '#F3F4F6',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#1B4D3E',
        borderRadius: 3,
    },
    speciesCount: {
        alignItems: 'flex-end',
        marginLeft: 12,
    },
    countValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
    },
    countPercent: {
        fontSize: 12,
        color: '#6B7280',
    },
});

export default StatsScreen;