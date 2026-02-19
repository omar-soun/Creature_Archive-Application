//HomeScreen.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth } from '@react-native-firebase/auth';
import { apiService } from '../../../services/api';
import { fileStorageService } from '../../../services/storage';
import BottomTabBar, { TabRoute } from '../../../shared/components/BottomTabBar';
import useJournalEntries from '../../../features/journal/hooks/useJournalEntries';
import { useTheme } from '../../../core/theme';

const PROFILE_CACHE_KEY = '@creature_archive_cached_profile';

interface BackendUserProfile {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  institution: string;
  currentRole: string;
  entryCount: number;
  createdAt: string;
  lastSync: string | null;
  profileImage?: string;
}

interface HomeScreenProps {
  onNavigate: (route: any, params?: any) => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate }) => {
  const { isDarkMode, theme } = useTheme();
  const [user, setUser] = React.useState<BackendUserProfile | null>(null);
  const [profileImage, setProfileImage] = React.useState<string | null>(null);
  const { entries } = useJournalEntries();

  React.useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    let fetchedProfile: BackendUserProfile | null = null;

    try {
      // 1. Try fetching user data from backend API
      const userData = await apiService.getCurrentUser();
      fetchedProfile = userData;
      setUser(userData);

      // Cache for offline access
      await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(userData)).catch(() => { });
    } catch (_backendError) {
      // 2. Backend unreachable — fall back to cached profile or Firebase Auth
      try {
        const cached = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
        if (cached) {
          fetchedProfile = JSON.parse(cached);
          setUser(fetchedProfile);
        } else {
          const firebaseUser = getAuth().currentUser;
          if (firebaseUser) {
            fetchedProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              firstName: firebaseUser.displayName?.split(' ')[0] || '',
              lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ') || '',
              institution: '',
              currentRole: '',
              entryCount: 0,
              createdAt: firebaseUser.metadata.creationTime || '',
              lastSync: null,
            };
            setUser(fetchedProfile);
          }
        }
      } catch (_fallbackError) {
        console.warn('Could not load profile from any source');
      }
    }

    // 3. Fetch profile image: local file storage (primary) or download from cloud (fallback)
    try {
      let localImagePath = await fileStorageService.getProfileImagePath();

      if (!localImagePath && fetchedProfile?.profileImage) {
        // No local file — download from cloud and save locally
        localImagePath = await fileStorageService.downloadProfileImage(fetchedProfile.profileImage);
      }

      if (localImagePath) {
        const uri = localImagePath.startsWith('file://') ? localImagePath : `file://${localImagePath}`;
        setProfileImage(`${uri}?t=${Date.now()}`);
      } else if (fetchedProfile?.profileImage) {
        // Download failed — use cloud URL directly
        setProfileImage(fetchedProfile.profileImage);
      }
    } catch (_imgError) {
      // ignore
    }
  };

  const getInitials = () => {
    if (!user) return 'U';
    return `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`.toUpperCase();
  };

  const summaryStats = {
    totalObservations: entries.length,
    thisMonth: entries.filter(e => {
      const d = new Date(e.capturedAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length,
    thisWeek: entries.filter(e => {
      const d = new Date(e.capturedAt);
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return d > oneWeekAgo;
    }).length,
    today: entries.filter(e => {
      const d = new Date(e.capturedAt);
      const now = new Date();
      return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length,
  };

  // Sort by date descending and take top 5
  const recentActivity = entries
    .sort((a, b) => b.capturedAt - a.capturedAt)
    .slice(0, 5)
    .map(entry => {
      const entryDate = new Date(entry.capturedAt);
      const imageUri = entry.localImageUri
        ? (entry.localImageUri.startsWith('file://') ? entry.localImageUri : `file://${entry.localImageUri}`)
        : entry.imageUrl || null;
      const coordinates = entry.latitude && entry.longitude
        ? `${entry.latitude.toFixed(4)}° N, ${entry.longitude.toFixed(4)}° W`
        : '';
      return {
        id: entry.localId,
        species: entry.speciesName,
        scientificName: entry.scientificName,
        date: entryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + entryDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        confidence: Math.round(entry.confidenceScore * 100),
        image: imageUri ? { uri: imageUri } : require('../../../assets/1.png'),
        // Full entry data for detail navigation
        entryParams: {
          entry: {
            id: entry.localId,
            localId: entry.localId,
            firestoreId: entry.firestoreId,
            speciesName: entry.speciesName,
            scientificName: entry.scientificName,
            animalClass: entry.animalClass,
            date: entryDate.toISOString().split('T')[0],
            time: entryDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            location: entry.locationName || 'Unknown Location',
            coordinates: coordinates,
            confidence: Math.round((entry.confidenceScore || 0) * 100),
            tags: entry.tags || [],
            image: imageUri ? { uri: imageUri } : require('../../../assets/1.png'),
            notes: entry.notes,
            habitatType: entry.habitatType,
            behavior: entry.behaviorObserved,
            quantity: entry.quantity,
            syncStatus: entry.syncStatus,
          },
        },
      };
    });

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return '#059669';
    if (confidence >= 75) return '#D97706';
    return '#DC2626';
  };

  const getConfidenceBackground = (confidence: number) => {
    if (confidence >= 90) return '#ECFDF5';
    if (confidence >= 75) return '#FFFBEB';
    return '#FEF2F2';
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={[styles.headerTitle, { color: theme.text }]}>
                Creature Archive</Text>
              <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                Field Research Assistant</Text>
            </View>
            <TouchableOpacity
              style={styles.profileButton}
              activeOpacity={0.8}
              onPress={() => onNavigate('Profile')}
            >
              <View style={styles.profileAvatar}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={{ width: 44, height: 44, borderRadius: 14 }} />
                ) : (
                  <Text style={styles.profileInitial}>{getInitials()}</Text>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity
              style={[styles.actionCard, styles.actionCardPrimary]}
              activeOpacity={0.85}
              onPress={() => onNavigate('ScanSpecies')}
            >
              <View style={styles.actionIconPrimary}>
                <FontAwesome6 name="camera" size={28} color="#FFFFFF" />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTextPrimary}>New Journal</Text>
                <Text style={styles.actionDescPrimary}>Capture observation</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionCardSmall, { backgroundColor: theme.card }]}
                activeOpacity={0.85}
                onPress={() => onNavigate('Archive')}
              >
                <View style={[styles.actionIconSecondary, { backgroundColor: theme.border }]}>
                  <FontAwesome6 name="box-archive" size={22} color={theme.textSecondary} />
                </View>
                <Text style={[styles.actionTextSecondary, { color: theme.text }]}>View Archive</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCardSmall, { backgroundColor: theme.card }]}
                activeOpacity={0.85}
                onPress={() => onNavigate('Stats')}
              >
                <View style={[styles.actionIconSecondary, { backgroundColor: theme.border }]}>
                  <FontAwesome6 name="chart-simple" size={22} color={theme.textSecondary} />
                </View>
                <Text style={[styles.actionTextSecondary, { color: theme.text }]}>Analytics</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Research Summary */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Research Summary</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statsRow}>
              <View style={[styles.statCard, styles.statCardLarge, { backgroundColor: theme.card }]}>
                <Text style={[styles.statValue, { color: theme.text }]}>{summaryStats.totalObservations}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Total Observations</Text>
              </View>
              <View style={styles.statsColumn}>
                <View style={[styles.statCardSmall, { backgroundColor: theme.card }]}>
                  <Text style={[styles.statValueSmall, { color: theme.text }]}>{summaryStats.thisMonth}</Text>
                  <Text style={[styles.statLabelSmall, { color: theme.textSecondary }]}>This Month</Text>
                </View>
                <View style={[styles.statCardSmall, { backgroundColor: theme.card }]}>
                  <Text style={[styles.statValueSmall, { color: theme.text }]}>{summaryStats.thisWeek}</Text>
                  <Text style={[styles.statLabelSmall, { color: theme.textSecondary }]}>This Week</Text>
                </View>
              </View>
            </View>
            <View style={[styles.statCardToday, { backgroundColor: theme.card }]}>
              <View style={styles.todayContent}>
                <Text style={styles.statValueToday}>{summaryStats.today}</Text>
                <View>
                  <Text style={[styles.statLabelToday, { color: theme.text }]}>Today's Observations</Text>
                  <Text style={[styles.todaySubtext, { color: theme.textSecondary }]}>Keep up the great work!</Text>
                </View>
              </View>
              <View style={[styles.todayIcon, { backgroundColor: theme.accentLight }]}>
                <FontAwesome6 name="bullseye" size={22} color="#059669" />
              </View>
            </View>
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Activity</Text>
          <View style={[styles.activityList, { backgroundColor: theme.card }]}>
            {recentActivity.length > 0 ? (
              recentActivity.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.activityCard,
                    { borderBottomColor: theme.border },
                    index === recentActivity.length - 1 && styles.activityCardLast,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => onNavigate('JournalDetail', item.entryParams)}
                >
                  <View style={styles.activityImageContainer}>
                    <Image
                      source={item.image}
                      style={styles.activityImage}
                      resizeMode="cover"
                    />
                  </View>
                  <View style={styles.activityInfo}>
                    <Text style={[styles.speciesName, { color: theme.text }]}>{item.species}</Text>
                    <Text style={styles.scientificName}>{item.scientificName}</Text>
                    <Text style={[styles.activityDate, { color: theme.textSecondary }]}>{item.date}</Text>
                  </View>
                  <View
                    style={[
                      styles.confidenceBadge,
                      { backgroundColor: getConfidenceBackground(item.confidence) },
                    ]}
                  >
                    <Text
                      style={[
                        styles.confidenceText,
                        { color: getConfidenceColor(item.confidence) },
                      ]}
                    >
                      {item.confidence}%
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesome6 name="pencil" size={24} color={theme.textSecondary} style={{ marginBottom: 8 }} />
                <Text style={{ color: theme.textSecondary, fontWeight: '500', marginBottom: 4 }}>No recent activity</Text>
                <TouchableOpacity onPress={() => onNavigate('ScanSpecies')}>
                  <Text style={{ color: '#059669', fontWeight: '600' }}>+ Add your first entry</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <BottomTabBar currentRoute="Home" onNavigate={onNavigate} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  header: {
    marginBottom: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
    marginTop: 4,
  },
  profileButton: {
    padding: 2,
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
    marginBottom: 16,
  },
  quickActionsGrid: {
    gap: 12,
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  actionCardPrimary: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionIconPrimary: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconText: {
    fontSize: 28,
  },
  actionContent: {
    flex: 1,
  },
  actionTextPrimary: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionDescPrimary: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionCardSmall: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  actionIconSecondary: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionIconTextSmall: {
    fontSize: 22,
  },
  actionTextSecondary: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  statsContainer: {
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statsColumn: {
    flex: 1,
    gap: 12,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  statCardLarge: {
    flex: 1.2,
    justifyContent: 'space-between',
  },
  statCardSmall: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111827',
  },
  statValueSmall: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    marginTop: 4,
  },
  statLabelSmall: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    marginTop: 2,
  },
  statTrend: {
    marginTop: 8,
  },
  statTrendText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  statCardToday: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
  },
  todayContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statValueToday: {
    fontSize: 32,
    fontWeight: '700',
    color: '#059669',
  },
  statLabelToday: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  todaySubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  todayIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayIconText: {
    fontSize: 22,
  },
  activityList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  activityCardLast: {
    borderBottomWidth: 0,
  },
  activityImageContainer: {
    marginRight: 14,
  },
  activityImagePlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityImageIcon: {
    fontSize: 24,
  },
  activityImage: {
    width: 52,
    height: 52,
    borderRadius: 12,
  },
  activityInfo: {
    flex: 1,
  },
  speciesName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  scientificName: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 1,
  },
  activityDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  confidenceText: {
    fontSize: 13,
    fontWeight: '700',
  },
});

export default HomeScreen;