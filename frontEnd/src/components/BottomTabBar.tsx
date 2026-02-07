import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
} from 'react-native';

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
    return (
        <View style={styles.container}>
            {tabs.map((tab) => {
                const isActive = currentRoute === tab.route;
                return (
                    <TouchableOpacity
                        key={tab.route}
                        style={styles.tabItem}
                        onPress={() => onNavigate(tab.route)}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.iconContainer, isActive && styles.iconContainerActive]}>
                            <Text style={styles.iconText}>{tab.icon}</Text>
                        </View>
                        <Text style={[styles.label, isActive && styles.labelActive]}>
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
        backgroundColor: '#FFFFFF',
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
    iconContainerActive: {
        backgroundColor: '#ECFDF5',
    },
    iconText: {
        fontSize: 20,
    },
    label: {
        fontSize: 11,
        fontWeight: '600',
        color: '#9CA3AF',
    },
    labelActive: {
        color: '#1B4D3E',
    },
});

export default BottomTabBar;