import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import authService from '../services/authService';
import { apiService } from '../services/apiService';
import { fileStorageService } from '../services/fileStorageService';
import { syncManager } from '../services/syncManager';
import useJournalEntries from '../hooks/useJournalEntries';
import { useTheme } from '../context/ThemeContext';
import BottomTabBar, { TabRoute } from '../components/BottomTabBar';

// ============================================
// TYPES
// ============================================
interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  institution: string;
  role: string;
  profileImageUri?: string | null;
  joinDate: string;
  totalObservations: number;
  uniqueSpecies: number;
}

interface ProfileScreenProps {
  onNavigate: (route: TabRoute) => void;
  onSignOut?: () => void;
}


// ============================================
// PROFILE SCREEN COMPONENT
// ============================================
const ProfileScreen: React.FC<ProfileScreenProps> = ({ onNavigate, onSignOut }) => {
  // ============================================
  // STATE
  // ============================================
  const { isDarkMode, toggleDarkMode, theme } = useTheme();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // Local journal entries for computing stats
  const { entries } = useJournalEntries();

  // User state fetched from backend API
  const [user, setUser] = useState<UserProfile>({
    firstName: 'Loading...',
    lastName: '',
    email: '',
    institution: '...',
    role: '...',
    joinDate: '...',
    totalObservations: 0,
    uniqueSpecies: 0,
  });

  // Compute stats from local entries
  const uniqueSpeciesCount = new Set(entries.map(e => e.speciesName)).size;
  const fieldDaysCount = new Set(
    entries.map(e => new Date(e.capturedAt).toDateString())
  ).size;

  // ============================================
  // LOAD DATA FROM BACKEND API
  // ============================================
  useEffect(() => {
    loadPreferences();
    fetchProfileFromBackend();
  }, []);

  const fetchProfileFromBackend = async () => {
    try {
      const userData = await apiService.getCurrentUser();
      if (userData) {
        // Format join date from ISO string
        const joinDate = userData.createdAt
          ? new Date(userData.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          : 'Unknown';

        setUser({
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          email: userData.email || '',
          institution: userData.institution || 'No Institution',
          role: userData.currentRole || 'Researcher',
          joinDate: joinDate,
          totalObservations: userData.entryCount || 0,
          uniqueSpecies: uniqueSpeciesCount,
        });
      }
    } catch (err) {
      console.log('Profile fetch from backend failed (may be offline):', err);
    }
  };

  const loadPreferences = async () => {
    try {
      const savedImagePath = await fileStorageService.getProfileImagePath();
      if (savedImagePath) setProfileImage(savedImagePath);
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  };

  // ============================================
  // HANDLERS
  // ============================================
  const handleEditProfile = () => {
    // Navigate to edit screen logic here
    Alert.alert('Edit Profile', 'Navigate to edit profile form.');
  };

  const handleSyncPress = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      const result = await syncManager.sync();
      if (result.success) {
        Alert.alert(
          'Sync Complete',
          `Uploaded: ${result.uploaded}, Downloaded: ${result.downloaded}` +
          (result.conflicts > 0 ? `, Conflicts resolved: ${result.conflicts}` : '')
        );
        // Refresh profile data after sync
        fetchProfileFromBackend();
      } else {
        const errorMsg = result.errors.length > 0
          ? result.errors[0]
          : 'Sync could not complete. Will retry later.';
        Alert.alert('Sync Deferred', errorMsg);
      }
    } catch (error) {
      Alert.alert('Sync Failed', 'Unable to sync data. Please check your connection.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleChangeProfileImage = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 500,
        maxHeight: 500,
      });

      if (result.didCancel || result.errorCode) return;

      const uri = result.assets?.[0]?.uri;
      if (!uri) return;

      setIsUploadingImage(true);

      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        // Save locally + upload to backend; returns persistent local path
        const localPath = await authService.updateProfileImage(currentUser.uid, uri);
        setProfileImage(localPath);
      } else {
        // No auth user — just save locally
        const localPath = await fileStorageService.saveProfileImage(uri);
        setProfileImage(localPath);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile image');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const getInitials = (): string => {
    return `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`.toUpperCase();
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Profile</Text>
        </View>

        {/* PROFILE CARD */}
        <View style={[styles.profileCard, { backgroundColor: theme.card }]}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={handleChangeProfileImage}
            activeOpacity={0.8}
            disabled={isUploadingImage}
          >
            {isUploadingImage ? (
              <View style={[styles.avatar, styles.avatarLoading]}>
                <ActivityIndicator size="large" color="#FFFFFF" />
              </View>
            ) : profileImage ? (
              <Image source={{ uri: profileImage.startsWith('file://') ? profileImage : `file://${profileImage}` }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials()}</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={[styles.userName, { color: theme.text }]}>
            {user.firstName} {user.lastName}
          </Text>
          <Text style={styles.userRole}>{user.role}</Text>
          <Text style={[styles.userInstitution, { color: theme.textSecondary }]}>
            {user.institution}
          </Text>

          <View style={[styles.statsRow, { borderTopColor: theme.border }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.text }]}>{user.totalObservations}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Observations</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.text }]}>{uniqueSpeciesCount}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Species</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.text }]}>{fieldDaysCount}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Field Days</Text>
            </View>
          </View>
        </View>

        {/* Member Badge */}
        <View style={styles.memberBadge}>
          <Text style={styles.memberIcon}>🎓</Text>
          <View>
            <Text style={styles.memberTitle}>Research Member</Text>
            <Text style={styles.memberDate}>Since {user.joinDate}</Text>
          </View>
        </View>

        {/* ============================================ */}
        {/* SETTINGS SECTION (UPDATED) */}
        {/* ============================================ */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Settings</Text>

          <View style={[styles.settingsCard, { backgroundColor: theme.card }]}>

            {/* 1. Edit Profile (NEW) */}
            <TouchableOpacity
              style={[styles.settingItem, { borderBottomColor: theme.border }]}
              onPress={handleEditProfile}
              activeOpacity={0.7}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: isDarkMode ? '#374151' : '#F3F4F6' }]}>
                  <Text style={styles.settingIconText}>👤</Text>
                </View>
                <View>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>Edit Profile</Text>
                  <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>Update personal details</Text>
                </View>
              </View>
              <Text style={[styles.chevron, { color: theme.textSecondary }]}>›</Text>
            </TouchableOpacity>

            {/* 2. Sync to Cloud (UPDATED: Button/Icon instead of Toggle) */}
            <TouchableOpacity
              style={[styles.settingItem, { borderBottomColor: theme.border }]}
              onPress={handleSyncPress}
              activeOpacity={0.7}
              disabled={isSyncing}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: theme.accentLight }]}>
                  <Text style={styles.settingIconText}>☁️</Text>
                </View>
                <View>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>Sync to Cloud</Text>
                  <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>
                    {isSyncing ? 'Syncing...' : 'Tap to sync now'}
                  </Text>
                </View>
              </View>
              {isSyncing ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                // Sync Icon
                <View style={[styles.iconButton, { backgroundColor: theme.border }]}>
                  <Text style={{ fontSize: 16 }}>🔄</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* 3. Dark Mode */}
            <View style={styles.settingItemLast}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: isDarkMode ? '#312E81' : '#EEF2FF' }]}>
                  <Text style={styles.settingIconText}>🌙</Text>
                </View>
                <View>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>Dark Mode</Text>
                  <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>
                    {isDarkMode ? 'Dark theme active' : 'Light theme active'}
                  </Text>
                </View>
              </View>
              <Switch
                value={isDarkMode}
                onValueChange={(val: boolean) => toggleDarkMode(val)}
                trackColor={{ false: theme.border, true: '#818CF8' }}
                thumbColor={isDarkMode ? '#4F46E5' : '#F4F4F5'}
                ios_backgroundColor={theme.border}
              />
            </View>

          </View>
        </View>

        {/* ABOUT SECTION */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>About</Text>
          <View style={[styles.aboutCard, { backgroundColor: theme.card }]}>
            <View style={[styles.aboutRow, { borderBottomColor: theme.border }]}>
              <Text style={[styles.aboutLabel, { color: theme.textSecondary }]}>Version</Text>
              <Text style={[styles.aboutValue, { color: theme.text }]}>1.1.1</Text>
            </View>
            <View style={[styles.aboutRow, { borderBottomColor: theme.border }]}>
              <Text style={[styles.aboutLabel, { color: theme.textSecondary }]}>Database</Text>
              <Text style={[styles.aboutValue, { color: theme.text }]}>v2024.12</Text>
            </View>
            <View style={styles.aboutRowLast}>
              <Text style={[styles.aboutLabel, { color: theme.textSecondary }]}>License</Text>
              <Text style={[styles.aboutValue, { color: theme.text }]}>Academic Research</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={onSignOut} activeOpacity={0.85}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={styles.branding}>
          <Text style={styles.brandingIcon}>🦎</Text>
          <Text style={[styles.brandingText, { color: theme.textSecondary }]}>Creature Archive</Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <BottomTabBar currentRoute="Profile" onNavigate={onNavigate} />
    </View>
  );
};

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 20 },
  header: { marginBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },

  // Profile Card
  profileCard: { borderRadius: 24, padding: 28, alignItems: 'center', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  avatarContainer: { position: 'relative', marginBottom: 20 },
  avatar: { width: 100, height: 100, borderRadius: 30, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  avatarLoading: { backgroundColor: '#6B7280' },
  avatarImage: { width: 100, height: 100, borderRadius: 30 },
  avatarText: { fontSize: 36, fontWeight: '700', color: '#FFFFFF' },
  userName: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  userRole: { fontSize: 16, color: '#059669', fontWeight: '600', marginBottom: 4 },
  userInstitution: { fontSize: 14, marginBottom: 24 },
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 20, borderTopWidth: 1, width: '100%' },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 4, fontWeight: '500' },
  statDivider: { width: 1, height: 36 },

  // Member Badge
  memberBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 14, padding: 14, marginBottom: 24, gap: 12 },
  memberIcon: { fontSize: 24 },
  memberTitle: { fontSize: 14, fontWeight: '600', color: '#059669' },
  memberDate: { fontSize: 13, color: '#059669' },

  // Sections
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 12, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  settingsCard: { borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },

  // Settings Items
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  settingItemLast: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  settingIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingIconText: { fontSize: 20 },
  settingLabel: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  settingDesc: { fontSize: 13 },

  // New Styles for Edit/Sync
  chevron: { fontSize: 22, fontWeight: '600', paddingRight: 4 },
  iconButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  // About Card
  aboutCard: { borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
  aboutRowLast: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  aboutLabel: { fontSize: 14, fontWeight: '500' },
  aboutValue: { fontSize: 14, fontWeight: '600' },

  // Sign Out / Branding
  signOutButton: { backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 24 },
  signOutText: { fontSize: 16, fontWeight: '600', color: '#DC2626' },
  branding: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 },
  brandingIcon: { fontSize: 20 },
  brandingText: { fontSize: 14, fontWeight: '500' },
});

export default ProfileScreen;