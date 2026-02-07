import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    TouchableOpacity,
    Platform,
    Dimensions,
    Animated,
    Alert,
    Linking,
    Image,
    ActivityIndicator,
    PermissionsAndroid,
} from 'react-native';

/**
 * INSTALLATION:
 * 
 * npm install react-native-vision-camera react-native-image-picker @react-native-community/geolocation
 * cd ios && pod install
 */

import {
    Camera,
    useCameraDevice,
    useCameraPermission,
    PhotoFile,
} from 'react-native-vision-camera';

import {
    launchImageLibrary,
    ImagePickerResponse,
} from 'react-native-image-picker';

import Geolocation from '@react-native-community/geolocation';

interface ScanSpeciesScreenProps {
    onNavigate: (route: any, params?: any) => void;
    onBack: () => void;
}

interface LocationData {
    latitude: number;
    longitude: number;
}

const { width } = Dimensions.get('window');
const SCAN_FRAME_SIZE = width * 0.72;
const CORNER_SIZE = 32;
const CORNER_THICKNESS = 4;

const ScanSpeciesScreen: React.FC<ScanSpeciesScreenProps> = ({ onNavigate, onBack }) => {
    // Camera State
    const [isCapturing, setIsCapturing] = useState(false);
    const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
    const [cameraPosition, setCameraPosition] = useState<'back' | 'front'>('back');
    const [flash, setFlash] = useState<'off' | 'on'>('off');
    const [isLoadingGallery, setIsLoadingGallery] = useState(false);
    const [isCameraReady, setIsCameraReady] = useState(false);

    // Location State
    const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
    const [locationServiceChecked, setLocationServiceChecked] = useState(false);

    // Refs
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const cameraRef = useRef<Camera>(null);

    // Camera hooks
    const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
    const device = useCameraDevice(cameraPosition);
    const supportsFlash = device?.hasFlash ?? false;

    // ============================================
    // CHECK IF LOCATION SERVICE IS ENABLED
    // ============================================
    const checkLocationServiceEnabled = useCallback(() => {
        // Try to get current position - if it fails with specific error, location is OFF
        Geolocation.getCurrentPosition(
            (position) => {
                // Location service is ON and we got position
                setCurrentLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
                setLocationServiceChecked(true);
                
                // Start background watcher
                startLocationWatcher();
            },
            (error) => {
                setLocationServiceChecked(true);
                
                // Error code 1 = Permission denied
                // Error code 2 = Position unavailable (location service OFF)
                // Error code 3 = Timeout
                
                if (error.code === 2 || error.code === 1) {
                    // Location service is OFF or permission denied - show alert
                    Alert.alert(
                        'Location is Turned Off',
                        'Please enable location services to tag your observations with GPS coordinates.',
                        [
                            {
                                text: 'Not Now',
                                style: 'cancel',
                            },
                            {
                                text: 'Turn On Location',
                                onPress: () => {
                                    // Open device location settings
                                    if (Platform.OS === 'ios') {
                                        Linking.openURL('app-settings:');
                                    } else {
                                        Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
                                    }
                                },
                            },
                        ]
                    );
                }
            },
            {
                enableHighAccuracy: false,
                timeout: 5000,
                maximumAge: 60000,
            }
        );
    }, []);

    // Start location watcher in background
    const startLocationWatcher = useCallback(() => {
        const watchId = Geolocation.watchPosition(
            (position) => {
                setCurrentLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            },
            () => {}, // Silent error
            {
                enableHighAccuracy: false,
                distanceFilter: 50,
            }
        );

        return watchId;
    }, []);

    // ============================================
    // INITIALIZE ON MOUNT
    // ============================================
    useEffect(() => {
        // Request camera permission if needed
        if (!hasCameraPermission) {
            requestCameraPermission();
        }

        // Check location service status IMMEDIATELY on screen open
        checkLocationServiceEnabled();

        // Cleanup
        return () => {
            // Clear any watchers if needed
        };
    }, []);

    // Camera ready callback
    const onCameraReady = useCallback(() => {
        setIsCameraReady(true);
    }, []);

    // Format coordinates for display
    const formatCoordinates = (location: LocationData | null): string => {
        if (!location) return '';
        const lat = Math.abs(location.latitude).toFixed(4);
        const lng = Math.abs(location.longitude).toFixed(4);
        const latDir = location.latitude >= 0 ? 'N' : 'S';
        const lngDir = location.longitude >= 0 ? 'E' : 'W';
        return `${lat}° ${latDir}, ${lng}° ${lngDir}`;
    };

    // ============================================
    // PHOTO CAPTURE
    // ============================================
    const handleCapture = async () => {
        if (!cameraRef.current || isCapturing || !isCameraReady) return;

        setIsCapturing(true);

        Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 0.9, duration: 100, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
        ]).start();

        try {
            const photo: PhotoFile = await cameraRef.current.takePhoto({
                flash: flash,
                qualityPrioritization: 'quality',
                enableShutterSound: true,
            });

            const photoUri = Platform.OS === 'ios' ? photo.path : `file://${photo.path}`;
            setCapturedPhoto(photoUri);
        } catch (error: any) {
            Alert.alert('Capture Failed', error.message || 'Unable to take photo.');
        } finally {
            setIsCapturing(false);
        }
    };

    // ============================================
    // FLASH TOGGLE
    // ============================================
    const handleToggleFlash = () => {
        if (!supportsFlash) {
            Alert.alert('Flash Unavailable', 'This camera does not support flash.');
            return;
        }
        setFlash(prev => (prev === 'off' ? 'on' : 'off'));
    };

    // ============================================
    // FLIP CAMERA
    // ============================================
    const handleFlipCamera = () => {
        setIsCameraReady(false);
        setFlash('off');
        setCameraPosition(prev => (prev === 'back' ? 'front' : 'back'));
    };

    // ============================================
    // GALLERY
    // ============================================
    const handleOpenGallery = async () => {
        setIsLoadingGallery(true);
        try {
            const result = await launchImageLibrary({
                mediaType: 'photo',
                quality: 1,
                maxWidth: 2000,
                maxHeight: 2000,
                selectionLimit: 1,
            });

            if (result.didCancel) {
                setIsLoadingGallery(false);
                return;
            }

            if (result.errorCode) {
                if (result.errorCode === 'permission') {
                    Alert.alert('Permission Required', 'Please grant photo library access.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Settings', onPress: () => Linking.openSettings() },
                    ]);
                }
                setIsLoadingGallery(false);
                return;
            }

            if (result.assets?.[0]?.uri) {
                setCapturedPhoto(result.assets[0].uri);
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to open gallery.');
        } finally {
            setIsLoadingGallery(false);
        }
    };

    // ============================================
    // RETAKE & IDENTIFY
    // ============================================
    const handleRetake = () => setCapturedPhoto(null);

    const handleIdentifySpecies = () => {
        if (!capturedPhoto) return;
        onNavigate('IdentificationResult', {
            photoUri: capturedPhoto,
            location: currentLocation,
            timestamp: new Date().toISOString(),
        });
    };

    // ============================================
    // RENDER: Camera Permission Required
    // ============================================
    if (!hasCameraPermission) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={onBack}>
                        <Text style={styles.backArrow}>‹</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Scan Species</Text>
                    <View style={styles.headerRight} />
                </View>
                <View style={styles.permissionContainer}>
                    <View style={styles.permissionIconBox}>
                        <Text style={styles.permissionIcon}>📷</Text>
                    </View>
                    <Text style={styles.permissionTitle}>Camera Access Required</Text>
                    <Text style={styles.permissionDesc}>
                        To identify species, Creature Archive needs access to your camera.
                    </Text>
                    <TouchableOpacity
                        style={styles.permissionBtn}
                        onPress={async () => {
                            const granted = await requestCameraPermission();
                            if (!granted) {
                                Alert.alert('Permission Denied', 'Please enable camera in Settings.', [
                                    { text: 'Cancel' },
                                    { text: 'Settings', onPress: () => Linking.openSettings() },
                                ]);
                            }
                        }}
                    >
                        <Text style={styles.permissionBtnText}>Allow Camera Access</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // ============================================
    // RENDER: No Camera Device
    // ============================================
    if (!device) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={onBack}>
                        <Text style={styles.backArrow}>‹</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Scan Species</Text>
                    <View style={styles.headerRight} />
                </View>
                <View style={styles.permissionContainer}>
                    <View style={[styles.permissionIconBox, { backgroundColor: '#FEE2E2' }]}>
                        <Text style={styles.permissionIcon}>⚠️</Text>
                    </View>
                    <Text style={styles.permissionTitle}>Camera Unavailable</Text>
                    <TouchableOpacity style={styles.permissionBtn} onPress={handleOpenGallery}>
                        <Text style={styles.permissionBtnText}>Select from Gallery</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // ============================================
    // RENDER: Photo Preview
    // ============================================
    if (capturedPhoto) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="light-content" backgroundColor="#000000" />
                <Image source={{ uri: capturedPhoto }} style={styles.previewImage} />

                {/* Header */}
                <View style={styles.previewHeader}>
                    <TouchableOpacity style={styles.previewCloseBtn} onPress={handleRetake}>
                        <Text style={styles.previewCloseIcon}>✕</Text>
                    </TouchableOpacity>
                    <Text style={styles.previewTitle}>Review Photo</Text>
                    <View style={styles.headerRight} />
                </View>

                {/* Location Badge (only show if available) */}
                {currentLocation && (
                    <View style={styles.locationBadge}>
                        <Text style={styles.locationBadgeIcon}>📍</Text>
                        <Text style={styles.locationBadgeText}>{formatCoordinates(currentLocation)}</Text>
                    </View>
                )}

                {/* Actions */}
                <View style={styles.previewActions}>
                    <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake}>
                        <Text style={styles.retakeBtnIcon}>↺</Text>
                        <Text style={styles.retakeBtnText}>Retake</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.identifyBtn} onPress={handleIdentifySpecies}>
                        <Text style={styles.identifyBtnText}>Identify Species</Text>
                        <Text style={styles.identifyBtnIcon}>→</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // ============================================
    // RENDER: Camera View
    // ============================================
    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#000000" />

            {/* Camera */}
            <Camera
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={true}
                photo={true}
                torch={flash === 'on' ? 'on' : 'off'}
                enableZoomGesture={true}
                onInitialized={onCameraReady}
                onError={(error) => console.error('Camera error:', error)}
            />

            {/* Header */}
            <View style={styles.cameraHeader}>
                <TouchableOpacity style={styles.cameraHeaderBtn} onPress={onBack}>
                    <Text style={styles.cameraHeaderBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.cameraTitle}>Scan Species</Text>
                <TouchableOpacity
                    style={[
                        styles.cameraHeaderBtn,
                        flash === 'on' && styles.flashBtnActive,
                        !supportsFlash && styles.flashBtnDisabled,
                    ]}
                    onPress={handleToggleFlash}
                    disabled={!supportsFlash}
                >
                    <Text style={styles.flashIcon}>{flash === 'on' ? '🔦' : '⚡'}</Text>
                </TouchableOpacity>
            </View>

            {/* Location Badge (only show if available) */}
            {currentLocation && (
                <View style={styles.locationStatusBadge}>
                    <Text style={styles.locationStatusIcon}>📍</Text>
                    <Text style={styles.locationStatusText}>{formatCoordinates(currentLocation)}</Text>
                </View>
            )}

            {/* Scan Frame Overlay */}
            <View style={styles.scanOverlay} pointerEvents="none">
                <View style={styles.overlayTop} />
                <View style={styles.overlayMiddle}>
                    <View style={styles.overlaySide} />
                    <View style={styles.scanFrame}>
                        <View style={[styles.corner, styles.cornerTL]}>
                            <View style={[styles.cornerBar, styles.cornerBarH]} />
                            <View style={[styles.cornerBar, styles.cornerBarV]} />
                        </View>
                        <View style={[styles.corner, styles.cornerTR]}>
                            <View style={[styles.cornerBar, styles.cornerBarH, styles.cornerBarHR]} />
                            <View style={[styles.cornerBar, styles.cornerBarV, styles.cornerBarVR]} />
                        </View>
                        <View style={[styles.corner, styles.cornerBL]}>
                            <View style={[styles.cornerBar, styles.cornerBarH, styles.cornerBarHB]} />
                            <View style={[styles.cornerBar, styles.cornerBarV, styles.cornerBarVB]} />
                        </View>
                        <View style={[styles.corner, styles.cornerBR]}>
                            <View style={[styles.cornerBar, styles.cornerBarH, styles.cornerBarHBR]} />
                            <View style={[styles.cornerBar, styles.cornerBarV, styles.cornerBarVBR]} />
                        </View>
                    </View>
                    <View style={styles.overlaySide} />
                </View>
                <View style={styles.overlayBottom} />
            </View>

            {/* Instruction */}
            <View style={styles.instructionBadge}>
                <Text style={styles.instructionIcon}>🎯</Text>
                <Text style={styles.instructionText}>Position creature in frame</Text>
            </View>

            {/* Controls */}
            <View style={styles.controlPanel}>
                <View style={styles.controlsRow}>
                    <TouchableOpacity
                        style={styles.sideBtn}
                        onPress={handleOpenGallery}
                        disabled={isLoadingGallery}
                    >
                        <View style={styles.sideBtnIcon}>
                            {isLoadingGallery ? (
                                <ActivityIndicator size="small" color="#1B4D3E" />
                            ) : (
                                <Text style={styles.sideBtnEmoji}>🖼️</Text>
                            )}
                        </View>
                        <Text style={styles.sideBtnLabel}>Gallery</Text>
                    </TouchableOpacity>

                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <TouchableOpacity
                            style={[styles.shutterOuter, (!isCameraReady || isCapturing) && styles.shutterDisabled]}
                            onPress={handleCapture}
                            disabled={!isCameraReady || isCapturing}
                        >
                            <View style={styles.shutterMiddle}>
                                {isCapturing ? (
                                    <ActivityIndicator size="large" color="#FFF" />
                                ) : (
                                    <View style={styles.shutterInner} />
                                )}
                            </View>
                        </TouchableOpacity>
                    </Animated.View>

                    <TouchableOpacity style={styles.sideBtn} onPress={handleFlipCamera}>
                        <View style={styles.sideBtnIcon}>
                            <Text style={styles.sideBtnEmoji}>🔄</Text>
                        </View>
                        <Text style={styles.sideBtnLabel}>Flip</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.footerRow}>
                    <Text style={styles.footerText}>Tap to capture</Text>
                    <View style={styles.footerDot} />
                    <Text style={styles.footerText}>Works offline</Text>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 56 : 40,
        paddingBottom: 16,
        backgroundColor: '#FFF',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    backArrow: { fontSize: 28, color: '#111827', fontWeight: '300', marginTop: -2 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
    headerRight: { width: 40 },

    // Camera Header
    cameraHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 56 : 40,
        paddingBottom: 16,
        zIndex: 20,
    },
    cameraHeaderBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cameraHeaderBtnText: { fontSize: 28, color: '#FFF', fontWeight: '300', marginTop: -2 },
    cameraTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFF',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },

    // Flash
    flashBtnActive: { backgroundColor: '#FFD700' },
    flashBtnDisabled: { opacity: 0.4 },
    flashIcon: { fontSize: 22 },

    // Location Badge (Camera View)
    locationStatusBadge: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 115 : 100,
        left: 16,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        zIndex: 25,
    },
    locationStatusIcon: { fontSize: 14, marginRight: 6 },
    locationStatusText: { fontSize: 12, fontWeight: '600', color: '#FFF' },

    // Location Badge (Preview)
    locationBadge: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 115 : 100,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
        zIndex: 25,
    },
    locationBadgeIcon: { fontSize: 16, marginRight: 8 },
    locationBadgeText: { fontSize: 14, fontWeight: '600', color: '#FFF' },

    // Permission
    permissionContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        backgroundColor: '#F8FAFC',
    },
    permissionIconBox: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#ECFDF5',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    permissionIcon: { fontSize: 48 },
    permissionTitle: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 12, textAlign: 'center' },
    permissionDesc: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 32, lineHeight: 24 },
    permissionBtn: { backgroundColor: '#1B4D3E', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 14 },
    permissionBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },

    // Scan Overlay
    scanOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
    overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    overlayMiddle: { flexDirection: 'row' },
    overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    scanFrame: { width: SCAN_FRAME_SIZE, height: SCAN_FRAME_SIZE, position: 'relative' },

    // Corners
    corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE },
    cornerTL: { top: 0, left: 0 },
    cornerTR: { top: 0, right: 0 },
    cornerBL: { bottom: 0, left: 0 },
    cornerBR: { bottom: 0, right: 0 },
    cornerBar: { position: 'absolute', backgroundColor: '#1B4D3E', borderRadius: CORNER_THICKNESS / 2 },
    cornerBarH: { width: CORNER_SIZE, height: CORNER_THICKNESS, top: 0, left: 0 },
    cornerBarV: { width: CORNER_THICKNESS, height: CORNER_SIZE, top: 0, left: 0 },
    cornerBarHR: { left: undefined, right: 0 },
    cornerBarVR: { left: undefined, right: 0 },
    cornerBarHB: { top: undefined, bottom: 0 },
    cornerBarVB: { top: undefined, bottom: 0 },
    cornerBarHBR: { top: undefined, bottom: 0, left: undefined, right: 0 },
    cornerBarVBR: { top: undefined, bottom: 0, left: undefined, right: 0 },

    // Instruction
    instructionBadge: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 150 : 135,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.65)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
        zIndex: 20,
    },
    instructionIcon: { fontSize: 16, marginRight: 8 },
    instructionText: { fontSize: 14, color: '#FFF', fontWeight: '600' },

    // Controls
    controlPanel: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#FFF',
        paddingTop: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        paddingHorizontal: 20,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        alignItems: 'center',
        zIndex: 20,
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    sideBtn: { alignItems: 'center', width: 60 },
    sideBtnIcon: {
        width: 52,
        height: 52,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },
    sideBtnEmoji: { fontSize: 24 },
    sideBtnLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },

    // Shutter
    shutterOuter: {
        width: 84,
        height: 84,
        borderRadius: 42,
        borderWidth: 4,
        borderColor: '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFF',
    },
    shutterDisabled: { opacity: 0.6 },
    shutterMiddle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        borderWidth: 3,
        borderColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#1B4D3E' },

    // Footer
    footerRow: { flexDirection: 'row', alignItems: 'center' },
    footerText: { fontSize: 12, color: '#9CA3AF', fontWeight: '500', marginHorizontal: 6 },
    footerDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },

    // Preview
    previewImage: { ...StyleSheet.absoluteFillObject, resizeMode: 'cover' },
    previewHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 56 : 40,
        paddingBottom: 16,
        zIndex: 10,
    },
    previewCloseBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    previewCloseIcon: { fontSize: 20, color: '#FFF', fontWeight: '600' },
    previewTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFF',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    previewActions: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        padding: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        gap: 12,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    retakeBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.95)',
        paddingVertical: 16,
        borderRadius: 14,
    },
    retakeBtnIcon: { fontSize: 18, color: '#374151', marginRight: 8 },
    retakeBtnText: { fontSize: 16, fontWeight: '600', color: '#374151' },
    identifyBtn: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1B4D3E',
        paddingVertical: 16,
        borderRadius: 14,
    },
    identifyBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF', marginRight: 8 },
    identifyBtnIcon: { fontSize: 16, color: '#FFF' },
});

export default ScanSpeciesScreen;