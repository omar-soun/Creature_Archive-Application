import { useState, useRef, useCallback } from 'react';
import { Platform, Animated, Linking } from 'react-native';

import {
    Camera,
    PhotoFile,
} from 'react-native-vision-camera';

import {
    launchImageLibrary,
} from 'react-native-image-picker';

interface UseCameraParams {
    showAlert: (title: string, message?: string, buttons?: any[]) => void;
}

export const useCamera = ({ showAlert }: UseCameraParams) => {
    // Camera State
    const [isCapturing, setIsCapturing] = useState(false);
    const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
    const [cameraPosition, setCameraPosition] = useState<'back' | 'front'>('back');
    const [flash, setFlash] = useState<'off' | 'on'>('off');
    const [isLoadingGallery, setIsLoadingGallery] = useState(false);
    const [isCameraReady, setIsCameraReady] = useState(false);

    // Refs
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const cameraRef = useRef<Camera>(null);

    // Camera ready callback
    const onCameraReady = useCallback(() => {
        setIsCameraReady(true);
    }, []);

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
            showAlert('Capture Failed', error.message || 'Unable to take photo.');
        } finally {
            setIsCapturing(false);
        }
    };

    // ============================================
    // FLASH TOGGLE
    // ============================================
    const handleToggleFlash = () => {
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
                    showAlert('Permission Required', 'Please grant photo library access.', [
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
            showAlert('Error', 'Failed to open gallery.');
        } finally {
            setIsLoadingGallery(false);
        }
    };

    // ============================================
    // RETAKE
    // ============================================
    const handleRetake = () => setCapturedPhoto(null);

    return {
        // State
        isCapturing,
        capturedPhoto,
        setCapturedPhoto,
        cameraPosition,
        flash,
        isCameraReady,
        isLoadingGallery,
        // Refs
        pulseAnim,
        cameraRef,
        // Handlers
        handleCapture,
        handleToggleFlash,
        handleFlipCamera,
        handleOpenGallery,
        handleRetake,
        onCameraReady,
    };
};
