import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

export type TabRoute = 'Home' | 'Archive' | 'Stats' | 'Profile';

interface BottomTabBarProps {
    currentRoute: TabRoute;
    onNavigate: (route: TabRoute) => void;
}

interface TabItem {
    route: TabRoute;
    label: string;
    icon: string;
}

const tabs: TabItem[] = [
    { route: 'Home', label: 'Home', icon: '🏠' },
    { route: 'Archive', label: 'Archive', icon: '📦' },
    { route: 'Stats', label: 'Stats', icon: '📊' },
    { route: 'Profile', label: 'Profile', icon: '👤' },
];

const BottomTabBar: React.FC<BottomTabBarProps> = ({ currentRoute, onNavigate }) => {
    const { isDarkMode, theme } = useTheme();

    return (
        <View style={[styles.container, { backgroundColor: theme.card }]}>
            {tabs.map((tab) => {
                const isActive = currentRoute === tab.route;
                return (
                    <TouchableOpacity
                        key={tab.route}
                        style={styles.tabItem}
                        onPress={() => onNavigate(tab.route)}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.iconContainer, isActive && { backgroundColor: theme.accentLight }]}>
                            <Text style={styles.iconText}>{tab.icon}</Text>
                        </View>
                        <Text style={[styles.label, { color: isDarkMode ? '#64748B' : '#9CA3AF' }, isActive && styles.labelActive]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 10,
        paddingBottom: Platform.OS === 'ios' ? 28 : 12,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 12,
    },
    tabItem: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    iconContainer: {
        width: 44,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    iconText: {
        fontSize: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
    },
    labelActive: {
        color: '#059669',
        fontWeight: '700',
    },
});

export default BottomTabBar;
