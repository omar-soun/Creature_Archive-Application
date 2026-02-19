import React, { useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    TouchableOpacity,
    Platform,
    Dimensions,
    Animated,
    Linking,
    Image,
    ActivityIndicator,
    useWindowDimensions,
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
} from 'react-native-vision-camera';

import { useTheme } from '../../../core/theme';
import { useAlert } from '../../../core/alerts';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';

import { useCamera } from '../hooks/useCamera';
import { useLocation } from '../hooks/useLocation';
import { useCropOverlay } from '../hooks/useCropOverlay';

interface ScanSpeciesScreenProps {
    onNavigate: (route: any, params?: any) => void;
    onBack: () => void;
}

const { width } = Dimensions.get('window');
const SCAN_FRAME_SIZE = width * 0.72;
const CORNER_SIZE = 32;
const CORNER_THICKNESS = 4;

const ScanSpeciesScreen: React.FC<ScanSpeciesScreenProps> = ({ onNavigate, onBack }) => {
    const { isDarkMode, theme } = useTheme();
    const { showAlert } = useAlert();

    // Orientation-aware camera preview
    const { width: winWidth, height: winHeight } = useWindowDimensions();
    const isLandscape = winWidth > winHeight;

    // Camera preview dimensions: 9:16 in portrait, 16:9 in landscape
    const cameraPreviewStyle = useMemo(() => {
        if (isLandscape) {
            // Landscape: 16:9 ratio, fit to screen height
            const previewHeight = winHeight;
            const previewWidth = previewHeight * (16 / 9);
            return {
                width: Math.min(previewWidth, winWidth),
                height: previewHeight,
                alignSelf: 'center' as const,
            };
        } else {
            // Portrait: 9:16 ratio, fit to screen width
            const previewWidth = winWidth;
            const previewHeight = previewWidth * (16 / 9);
            return {
                width: previewWidth,
                height: Math.min(previewHeight, winHeight),
                alignSelf: 'center' as const,
            };
        }
    }, [winWidth, winHeight, isLandscape]);

    // Dynamic scan frame size based on orientation
    const scanFrameSize = isLandscape
        ? Math.min(winHeight, winWidth) * 0.55
        : winWidth * 0.72;

    // ============================================
    // HOOKS
    // ============================================
    const {
        isCapturing,
        capturedPhoto,
        setCapturedPhoto,
        cameraPosition,
        flash,
        isCameraReady,
        isLoadingGallery,
        pulseAnim,
        cameraRef,
        handleCapture,
        handleToggleFlash,
        handleFlipCamera,
        handleOpenGallery,
        handleRetake,
        onCameraReady,
    } = useCamera({ showAlert });

    const {
        currentLocation,
        checkLocationServiceEnabled,
        formatCoordinates,
    } = useLocation({ showAlert });

    const {
        isCropping,
        cropBox,
        cropPanResponder,
        handleCropPhoto,
        handleCropConfirm,
        handleCropCancel,
    } = useCropOverlay({
        capturedPhoto,
        setCapturedPhoto,
        showAlert,
        screenDims: { width: winWidth, height: winHeight },
    });

    // Camera hooks
    const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
    const device = useCameraDevice(cameraPosition);
    const supportsFlash = device?.hasFlash ?? false;

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
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
                <View style={[styles.header, { backgroundColor: theme.card }]}>
                    <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.border }]} onPress={onBack}>
                        <Text style={[styles.backArrow, { color: theme.text }]}>‹</Text>
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>Scan Species</Text>
                    <View style={styles.headerRight} />
                </View>
                <View style={[styles.permissionContainer, { backgroundColor: theme.background }]}>
                    <View style={[styles.permissionIconBox, { backgroundColor: theme.accentLight }]}>
                        <FontAwesome6 name="camera" size={48} color="#1B4D3E" />
                    </View>
                    <Text style={[styles.permissionTitle, { color: theme.text }]}>Camera Access Required</Text>
                    <Text style={[styles.permissionDesc, { color: theme.textSecondary }]}>
                        To identify species, Creature Archive needs access to your camera.
                    </Text>
                    <TouchableOpacity
                        style={styles.permissionBtn}
                        onPress={async () => {
                            const granted = await requestCameraPermission();
                            if (!granted) {
                                showAlert('Permission Denied', 'Please enable camera in Settings.', [
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
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
                <View style={[styles.header, { backgroundColor: theme.card }]}>
                    <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.border }]} onPress={onBack}>
                        <Text style={[styles.backArrow, { color: theme.text }]}>‹</Text>
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>Scan Species</Text>
                    <View style={styles.headerRight} />
                </View>
                <View style={[styles.permissionContainer, { backgroundColor: theme.background }]}>
                    <View style={[styles.permissionIconBox, { backgroundColor: '#FEE2E2' }]}>
                        <FontAwesome6 name="triangle-exclamation" size={48} color="#DC2626" />
                    </View>
                    <Text style={[styles.permissionTitle, { color: theme.text }]}>Camera Unavailable</Text>
                    <TouchableOpacity style={styles.permissionBtn} onPress={handleOpenGallery}>
                        <Text style={styles.permissionBtnText}>Select from Gallery</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // ============================================
    // RENDER: Crop Mode
    // ============================================
    if (isCropping && capturedPhoto) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="light-content" backgroundColor="#000000" />
                <Image source={{ uri: capturedPhoto }} style={styles.previewImage} />

                {/* Crop overlay with pan responder */}
                <View style={StyleSheet.absoluteFill} {...cropPanResponder.panHandlers}>
                    {/* Dark masks around crop area */}
                    <View style={[styles.cropMask, { top: 0, left: 0, right: 0, height: cropBox.y }]} />
                    <View style={[styles.cropMask, { top: cropBox.y + cropBox.h, left: 0, right: 0, bottom: 0 }]} />
                    <View style={[styles.cropMask, { top: cropBox.y, left: 0, width: cropBox.x, height: cropBox.h }]} />
                    <View style={[styles.cropMask, { top: cropBox.y, left: cropBox.x + cropBox.w, right: 0, height: cropBox.h }]} />

                    {/* Crop border and grid */}
                    <View style={[styles.cropBorder, { top: cropBox.y, left: cropBox.x, width: cropBox.w, height: cropBox.h }]}>
                        <View style={[styles.cropGridH, { top: '33%' }]} />
                        <View style={[styles.cropGridH, { top: '66%' }]} />
                        <View style={[styles.cropGridV, { left: '33%' }]} />
                        <View style={[styles.cropGridV, { left: '66%' }]} />

                        {/* Corner handles */}
                        <View style={[styles.cropHandle, styles.cropHandleTL]} />
                        <View style={[styles.cropHandle, styles.cropHandleTR]} />
                        <View style={[styles.cropHandle, styles.cropHandleBL]} />
                        <View style={[styles.cropHandle, styles.cropHandleBR]} />
                    </View>
                </View>

                {/* Header */}
                <View style={[styles.previewHeader, { zIndex: 20 }]} pointerEvents="box-none">
                    <TouchableOpacity style={styles.previewCloseBtn} onPress={handleCropCancel}>
                        <Text style={styles.previewCloseIcon}>✕</Text>
                    </TouchableOpacity>
                    <Text style={styles.previewTitle}>Crop Photo</Text>
                    <View style={styles.headerRight} />
                </View>

                {/* Bottom actions */}
                <View style={[styles.previewActions, { zIndex: 20 }]} pointerEvents="box-none">
                    <TouchableOpacity style={styles.retakeBtn} onPress={handleCropCancel}>
                        <Text style={styles.retakeBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.identifyBtn} onPress={handleCropConfirm}>
                        <Text style={styles.identifyBtnText}>Done</Text>
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
                        <FontAwesome6 name="location-dot" size={14} color="#FFF" style={styles.locationBadgeIcon} />
                        <Text style={styles.locationBadgeText}>{formatCoordinates(currentLocation)}</Text>
                    </View>
                )}

                {/* Actions */}
                <View style={styles.previewActions}>
                    <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake}>
                        <FontAwesome6 name="camera-rotate" size={18} color="#374151" style={{marginRight: 8}} />
                        <Text style={styles.retakeBtnText}>Retake</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cropBtn} onPress={handleCropPhoto}>
                        <FontAwesome6 name="crop-simple" size={18} color="#374151" style={{marginRight: 8}} />
                        <Text style={styles.cropBtnText}>Crop</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.identifyBtn} onPress={handleIdentifySpecies}>
                        <Text style={styles.identifyBtnText}>Identify Species</Text>
                        <FontAwesome6 name="arrow-right" size={16} color="#FFF" />
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

            {/* Camera - orientation-aware preview */}
            <Camera
                ref={cameraRef}
                style={[StyleSheet.absoluteFill, cameraPreviewStyle]}
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
                    <FontAwesome6 name="bolt" size={20} color={flash === 'on' ? '#FFD700' : '#FFF'} />
                </TouchableOpacity>
            </View>

            {/* Location Badge (only show if available) */}
            {currentLocation && (
                <View style={styles.locationStatusBadge}>
                    <FontAwesome6 name="location-dot" size={14} color="#FFF" style={styles.locationStatusIcon} />
                    <Text style={styles.locationStatusText}>{formatCoordinates(currentLocation)}</Text>
                </View>
            )}

            {/* Scan Frame Overlay */}
            <View style={styles.scanOverlay} pointerEvents="none">
                <View style={styles.overlayTop} />
                <View style={styles.overlayMiddle}>
                    <View style={styles.overlaySide} />
                    <View style={[styles.scanFrame, { width: scanFrameSize, height: scanFrameSize }]}>
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
                <FontAwesome6 name="bullseye" size={20} color="#FFF" style={styles.instructionIcon} />
                <Text style={styles.instructionText}>Position creature in frame</Text>
            </View>

            {/* Controls */}
            <View style={[styles.controlPanel, { backgroundColor: theme.card }]}>
                <View style={styles.controlsRow}>
                    <TouchableOpacity
                        style={styles.sideBtn}
                        onPress={handleOpenGallery}
                        disabled={isLoadingGallery}
                    >
                        <View style={[styles.sideBtnIcon, { backgroundColor: theme.border }]}>
                            {isLoadingGallery ? (
                                <ActivityIndicator size="small" color="#1B4D3E" />
                            ) : (
                                <FontAwesome6 name="image" size={22} color="#6B7280" iconStyle="regular" />
                            )}
                        </View>
                        <Text style={[styles.sideBtnLabel, { color: theme.textSecondary }]}>Gallery</Text>
                    </TouchableOpacity>

                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <TouchableOpacity
                            style={[styles.shutterOuter, { backgroundColor: theme.card, borderColor: theme.border }, (!isCameraReady || isCapturing) && styles.shutterDisabled]}
                            onPress={handleCapture}
                            disabled={!isCameraReady || isCapturing}
                        >
                            <View style={[styles.shutterMiddle, { borderColor: theme.border }]}>
                                {isCapturing ? (
                                    <ActivityIndicator size="large" color="#FFF" />
                                ) : (
                                    <View style={styles.shutterInner} />
                                )}
                            </View>
                        </TouchableOpacity>
                    </Animated.View>

                    <TouchableOpacity style={styles.sideBtn} onPress={handleFlipCamera}>
                        <View style={[styles.sideBtnIcon, { backgroundColor: theme.border }]}>
                            <FontAwesome6 name="camera-rotate" size={22} color="#6B7280" />
                        </View>
                        <Text style={[styles.sideBtnLabel, { color: theme.textSecondary }]}>Flip</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.footerRow}>
                    <Text style={[styles.footerText, { color: theme.textSecondary }]}>Tap to capture</Text>
                    <View style={styles.footerDot} />
                    <Text style={[styles.footerText, { color: theme.textSecondary }]}>Works offline</Text>
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
    flashBtnActive: { backgroundColor: '#ffd9004c' },
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
    previewImage: { ...StyleSheet.absoluteFillObject, resizeMode: 'contain' },
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
    cropBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.95)',
        paddingVertical: 16,
        borderRadius: 14,
    },
    cropBtnIcon: { fontSize: 18, color: '#374151', marginRight: 8 },
    cropBtnText: { fontSize: 16, fontWeight: '600', color: '#374151' },

    // Crop Mode
    cropMask: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
    cropBorder: { position: 'absolute', borderWidth: 2, borderColor: '#FFFFFF' },
    cropGridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
    cropGridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
    cropHandle: { position: 'absolute', width: 20, height: 20, backgroundColor: '#FFFFFF', borderRadius: 10 },
    cropHandleTL: { top: -10, left: -10 },
    cropHandleTR: { top: -10, right: -10 },
    cropHandleBL: { bottom: -10, left: -10 },
    cropHandleBR: { bottom: -10, right: -10 },

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
