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
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import ImageCropModal from '../components/ImageCropModal';
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
  
  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tempUser, setTempUser] = useState<Partial<UserProfile>>({});

  // Crop Modal State
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ uri: string; width: number; height: number } | null>(null);

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
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    // 1. Fetch user profile from backend
    let backendProfileImage: string | undefined;
    try {
      const userData = await apiService.getCurrentUser();
      if (userData) {
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

        backendProfileImage = userData.profileImage;
      }
    } catch (err) {
      console.log('Profile fetch from backend failed (may be offline):', err);
    }

    // 2. Fetch profile image: local file storage (primary) or download from cloud (fallback)
    try {
      let localImagePath = await fileStorageService.getProfileImagePath();

      if (!localImagePath && backendProfileImage) {
        // No local file — download from cloud and save locally
        localImagePath = await fileStorageService.downloadProfileImage(backendProfileImage);
      }

      if (localImagePath) {
        const uri = localImagePath.startsWith('file://') ? localImagePath : `file://${localImagePath}`;
        setProfileImage(`${uri}?t=${Date.now()}`);
      } else if (backendProfileImage) {
        // Download failed — use cloud URL directly
        setProfileImage(backendProfileImage);
      }
    } catch (error) {
      console.error('Error loading profile image:', error);
    }
  };

  // ============================================
  // HANDLERS
  // ============================================
  
  // Toggle Edit Mode
  const handleEditToggle = () => {
    if (isEditing) {
      // Cancelled
      setIsEditing(false);
      setTempUser({});
    } else {
      // Started editing
      setTempUser({
        firstName: user.firstName,
        lastName: user.lastName,
        institution: user.institution,
        role: user.role,
      });
      setIsEditing(true);
    }
  };

  const handleSaveProfile = async () => {
    // Validation
    if (!tempUser.firstName?.trim() || !tempUser.lastName?.trim()) {
      Alert.alert('Validation Error', 'First and Last name are required.');
      return;
    }

    setIsSaving(true);
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) throw new Error('No user found');

      // Update backend via AuthService
      await authService.updateProfile(currentUser.uid, {
        firstName: tempUser.firstName,
        lastName: tempUser.lastName,
        institution: tempUser.institution,
        currentRole: tempUser.role
      });

      // Update local state
      setUser(prev => ({
        ...prev,
        ...tempUser as UserProfile
      }));

      Alert.alert('Success', 'Profile updated successfully.');
      setIsEditing(false);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
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
        loadProfileData();
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
        quality: 1,
      });

      if (result.didCancel || result.errorCode) return;

      const asset = result.assets?.[0];
      if (!asset?.uri || !asset.width || !asset.height) return;

      // Open crop modal with selected image
      setSelectedImage({ uri: asset.uri, width: asset.width, height: asset.height });
      setCropModalVisible(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to select image');
    }
  };

  const handleCropComplete = async (croppedUri: string) => {
    setCropModalVisible(false);
    setSelectedImage(null);
    setIsUploadingImage(true);

    try {
      // 1. Save locally first — update UI immediately
      const localPath = await fileStorageService.saveProfileImage(croppedUri);
      setProfileImage(`${localPath}?t=${Date.now()}`);
      setIsUploadingImage(false);

      // 2. Upload to cloud in the background (non-blocking)
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        apiService.uploadProfileImage(localPath)
          .then(({ imageUrl }) => authService.updateProfile(currentUser.uid, { profileImage: imageUrl }))
          .catch((err: any) => console.warn('Profile image cloud upload failed:', err));
      }
    } catch (error) {
      setIsUploadingImage(false);
      Alert.alert('Error', 'Failed to update profile image');
    }
  };

  const handleCropCancel = () => {
    setCropModalVisible(false);
    setSelectedImage(null);
  };

  const handleRemoveProfileImage = () => {
    Alert.alert(
      'Remove Profile Photo',
      'Are you sure you want to remove your profile photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Delete local file
              await fileStorageService.deleteProfileImage();
              setProfileImage(null);

              // 2. Clear cloud URL in backend
              const currentUser = authService.getCurrentUser();
              if (currentUser) {
                authService.updateProfile(currentUser.uid, { profileImage: '' })
                  .catch((err: any) => console.warn('Failed to clear cloud profile image:', err));
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to remove profile photo.');
            }
          },
        },
      ]
    );
  };

  const getInitials = (): string => {
    return `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`.toUpperCase();
  };

  // ============================================
  // RENDER HELPERS
  // ============================================
  const renderEditableField = (
    label: string, 
    value: string, 
    field: keyof UserProfile, 
    editable: boolean
  ) => {
    if (editable) {
        return (
            <View style={styles.editFieldContainer}>
                <Text style={[styles.editFieldLabel, { color: theme.textSecondary }]}>{label}</Text>
                <TextInput
                    style={[styles.editInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                    value={tempUser[field] as string || ''}
                    onChangeText={(text) => setTempUser(prev => ({ ...prev, [field]: text }))}
                    placeholder={label}
                    placeholderTextColor={theme.textSecondary}
                />
            </View>
        );
    }
    
    // View Mode Custom Rendering based on field
    if (field === 'firstName' || field === 'lastName') return null; // These are handled specially in the main View
    
    return null; // Logic is custom for the main card, so we might just use this for standard fields if we refactor.
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

      

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Back/Cancel and Edit/Save buttons */}
      <View style={styles.header}>
        {isEditing ? (
            <TouchableOpacity onPress={handleEditToggle} style={styles.headerButton}>
                <Text style={[styles.headerButtonText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
        ) : (
             <Text style={[styles.headerTitle, { color: theme.text }]}>Profile</Text>
        )}
        
        {isEditing && <Text style={[styles.headerTitle, { color: theme.text, fontSize: 20 }]}>Edit Profile</Text>}

        <TouchableOpacity 
            onPress={isEditing ? handleSaveProfile : handleEditToggle} 
            disabled={isSaving}
            style={[styles.headerButton, isEditing && styles.saveButton]}
        >
            {isSaving ? (
                <ActivityIndicator size="small" color={isEditing ? "#FFF" : theme.accent} />
            ) : (
                <Text style={[styles.headerButtonText, { color: isEditing ? '#FFF' : theme.accent, fontWeight: '700' }]}>
                    {isEditing ? 'Save' : ''}
                </Text>
            )}
        </TouchableOpacity>
      </View>

        {/* PROFILE CARD */}
        <View style={[styles.profileCard, { backgroundColor: theme.card }]}>
          <View style={styles.avatarContainer}>
            <TouchableOpacity
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

              {/* Camera Icon Overlay */}
              <View style={[styles.editBadge, { backgroundColor: theme.accent }]}>
                  <Text style={{ fontSize: 12 }}>📷</Text>
              </View>
            </TouchableOpacity>

            {/* Remove Photo Button - visible in edit mode when image exists */}
            {isEditing && profileImage && !isUploadingImage && (
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={handleRemoveProfileImage}
                activeOpacity={0.7}
              >
                <Text style={styles.removeImageText}>Remove Photo</Text>
              </TouchableOpacity>
            )}
          </View>

          {isEditing ? (
              /* EDIT MODE INPUTS */
              <View style={styles.editForm}>
                  <View style={styles.nameRow}>
                    <TextInput
                        style={[styles.editInput, styles.halfInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                        value={tempUser.firstName}
                        onChangeText={(t) => setTempUser(prev => ({ ...prev, firstName: t }))}
                        placeholder="First Name"
                        placeholderTextColor={theme.textSecondary}
                    />
                    <TextInput
                        style={[styles.editInput, styles.halfInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                        value={tempUser.lastName}
                        onChangeText={(t) => setTempUser(prev => ({ ...prev, lastName: t }))}
                        placeholder="Last Name"
                        placeholderTextColor={theme.textSecondary}
                    />
                  </View>
                  
                  <TextInput
                    style={[styles.editInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                    value={tempUser.role}
                    onChangeText={(t) => setTempUser(prev => ({ ...prev, role: t }))}
                    placeholder="Role (e.g. Researcher)"
                    placeholderTextColor={theme.textSecondary}
                  />

                  <TextInput
                    style={[styles.editInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                    value={tempUser.institution}
                    onChangeText={(t) => setTempUser(prev => ({ ...prev, institution: t }))}
                    placeholder="Institution"
                    placeholderTextColor={theme.textSecondary}
                  />
              </View>
          ) : (
              /* VIEW MODE DETAILS */
              <>
                <Text style={[styles.userName, { color: theme.text }]}>
                    {user.firstName} {user.lastName}
                </Text>
                <Text style={styles.userRole}>{user.role}</Text>
                <Text style={[styles.userInstitution, { color: theme.textSecondary }]}>
                    {user.institution}
                </Text>
              </>
          )}

          {/* Stats Row - Only Show in View Mode to save space or keep it? Keeping it looks better for layout stability */}
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

        {/* Member Badge - Hide in Edit Mode to focus on inputs? Or keep. Keeping. */}
        <View style={styles.memberBadge}>
          <Text style={styles.memberIcon}>🎓</Text>
          <View>
            <Text style={styles.memberTitle}>Research Member</Text>
            <Text style={styles.memberDate}>Since {user.joinDate}</Text>
          </View>
        </View>

        {/* ============================================ */}
        {/* SETTINGS SECTION */}
        {/* Hide Settings when Editing to prevent navigation away during edits */}
        {/* ============================================ */}
        {!isEditing && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Settings</Text>

          <View style={[styles.settingsCard, { backgroundColor: theme.card }]}>

            {/* 1. Edit Profile (Trigger) - REDUNDANT NOW that we have header button? 
                Keeping it as an alternative entry point or removing it.
                Let's keep it but make it trigger the same toggle.
            */}
            <TouchableOpacity
              style={[styles.settingItem, { borderBottomColor: theme.border }]}
              onPress={handleEditToggle}
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

            {/* 2. Sync to Cloud */}
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
        )}

        {/* ABOUT SECTION (Hide in Edit) */}
        {!isEditing && (
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
        )}

        {!isEditing && (
        <TouchableOpacity style={styles.signOutButton} onPress={onSignOut} activeOpacity={0.85}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
        )}

        <View style={styles.branding}>
          <Text style={styles.brandingIcon}>🦎</Text>
          <Text style={[styles.brandingText, { color: theme.textSecondary }]}>Creature Archive</Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      {!isEditing && <BottomTabBar currentRoute="Profile" onNavigate={onNavigate} />}

      {/* 1:1 Crop Modal */}
      {selectedImage && (
        <ImageCropModal
          visible={cropModalVisible}
          imageUri={selectedImage.uri}
          imageWidth={selectedImage.width}
          imageHeight={selectedImage.height}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </View>
  );
};

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingTop: 20, paddingHorizontal: 20 },
  header: { 
      marginTop: Platform.OS === 'ios' ? 60 : 40,
      marginBottom: 24, 
      marginHorizontal: 20, 
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'space-between' 
  },
  headerTitle: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  headerButton: { padding: 8 },
  headerButtonText: { fontSize: 16, fontWeight: '700' },
  saveButton: { backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },

  // Profile Card
  profileCard: { borderRadius: 24, padding: 28, alignItems: 'center', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  avatarContainer: { position: 'relative', marginBottom: 20 },
  avatar: { width: 100, height: 100, borderRadius: 30, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  avatarLoading: { backgroundColor: '#6B7280' },
  avatarImage: { width: 100, height: 100, borderRadius: 30 },
  avatarText: { fontSize: 36, fontWeight: '700', color: '#FFFFFF' },
  editBadge: { position: 'absolute', bottom: -5, right: -5, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
  
  userName: { fontSize: 24, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  userRole: { fontSize: 16, color: '#059669', fontWeight: '600', marginBottom: 4, textAlign: 'center' },
  userInstitution: { fontSize: 14, marginBottom: 24, textAlign: 'center' },
  
  // Edit Form
  editForm: { width: '100%', marginBottom: 20 },
  nameRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  halfInput: { flex: 1 },
  editInput: { 
      borderWidth: 1, 
      borderRadius: 12, 
      padding: 12, 
      fontSize: 16, 
      marginBottom: 12, 
      height: 50 
  },
  editFieldContainer: { marginBottom: 12 },
  editFieldLabel: { fontSize: 12, marginBottom: 4, marginLeft: 4 },

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
  
  // Remove Image Button
  removeImageButton: { marginTop: 8, paddingVertical: 6, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#FEF2F2' },
  removeImageText: { fontSize: 13, fontWeight: '600', color: '#DC2626', textAlign: 'center' },
});

export default ProfileScreen;