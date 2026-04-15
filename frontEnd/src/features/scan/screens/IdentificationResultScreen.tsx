import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    TouchableOpacity,
    Platform,
    Image,
    ScrollView,
    ActivityIndicator,
    TextInput,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import NetInfo from '@react-native-community/netinfo';
import useSpeciesDetection, { getStageText, LOW_CONFIDENCE_THRESHOLD } from '../hooks/useSpeciesDetection';
import { useTheme } from '../../../core/theme';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';
import { animalDetectService } from '../services/animalDetectService';
import type { AnimalDetectResult } from '../services/animalDetectService';
import type { DetectionResult } from '../hooks/useSpeciesDetection';

/**
 * ============================================
 * IDENTIFICATION RESULT SCREEN
 * ============================================
 *
 * Detection workflow:
 * 1. On mount: run on-device ML model → show prediction
 * 2. Ask user "Is this prediction correct?"
 *    ✅ YES → fill form → navigate to NewEntry
 *    ❌ NO  → check connectivity:
 *       Online  → call backend /species/detect (AnimalDetect API proxy)
 *                 → show result → fill form
 *       Offline → save as DRAFT locally; retry when back online
 * 3. User can always manually edit Animal Name, Scientific Name, Notes
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
    | 'detecting'           // ML model running
    | 'awaiting_confirmation' // result shown, ask user
    | 'fetching_online'     // calling AnimalDetect API
    | 'online_result'       // AnimalDetect result received
    | 'offline_draft'       // offline + rejected → save as draft
    | 'api_error'           // AnimalDetect API call failed
    | 'detection_error';    // ML detection failed

interface LocationData {
    latitude: number;
    longitude: number;
}

interface IdentificationResultScreenProps {
    onNavigate: (route: any, params?: any) => void;
    onBack: () => void;
    photoUri?: string;
    location?: { latitude: number; longitude: number } | null;
    // Cached state passed back by _returnParams when user navigates back from NewEntry.
    // When present, detection is skipped and these values are restored directly.
    cachedDetectionResult?: DetectionResult | null;
    cachedOnlineResult?: AnimalDetectResult | null;
    cachedPhase?: Phase;
    cachedCommonName?: string;
    cachedScientificName?: string;
    cachedNotes?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const IdentificationResultScreen: React.FC<IdentificationResultScreenProps> = ({
    onNavigate,
    onBack,
    photoUri,
    location: initialLocation,
    cachedDetectionResult,
    cachedOnlineResult,
    cachedPhase,
    cachedCommonName,
    cachedScientificName,
    cachedNotes,
}) => {
    const { isDarkMode, theme } = useTheme();
    const { detect, stage, error: mlError, reset } = useSpeciesDetection();

    // ── Whether this mount is a back-navigation restore ───────────────────────
    const isRestoredFromCache = Boolean(cachedPhase);

    // ── Phase state — restored from cache when navigating back ────────────────
    const [phase, setPhase] = useState<Phase>(cachedPhase ?? 'detecting');
    // Local copy of the ML result — set by detect() or restored from cache
    const [localMlResult, setLocalMlResult] = useState<DetectionResult | null>(
        cachedDetectionResult ?? null
    );
    const [onlineResult, setOnlineResult] = useState<AnimalDetectResult | null>(
        cachedOnlineResult ?? null
    );
    const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);

    // ── Date / Time ──────────────────────────────────────────────────────────
    const [observationDate, setObservationDate] = useState('');
    const [observationTime, setObservationTime] = useState('');

    // ── GPS ──────────────────────────────────────────────────────────────────
    const [gpsLocation, setGpsLocation] = useState<LocationData | null>(initialLocation || null);
    const [isRefreshingGps, setIsRefreshingGps] = useState(false);
    const gpsAttempted = useRef(false);

    // ── Manual edit fields — restored from cache or empty ─────────────────────
    const [manualCommonName, setManualCommonName] = useState(cachedCommonName ?? '');
    const [manualScientificName, setManualScientificName] = useState(cachedScientificName ?? '');
    const [manualNotes, setManualNotes] = useState(cachedNotes ?? '');
    const [isEditingManually, setIsEditingManually] = useState(false);

    // ─────────────────────────────────────────────────────────────────────────
    // Auto-fill date & time on mount
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const now = new Date();
        setObservationDate(
            now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        );
        setObservationTime(
            now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        );
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // GPS helpers
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (initialLocation || gpsAttempted.current) return;
        gpsAttempted.current = true;
        fetchGpsOnce();
    }, []);

    const fetchGpsOnce = () => {
        Geolocation.getCurrentPosition(
            (pos) => {
                setGpsLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
                setIsRefreshingGps(false);
            },
            () => { setGpsLocation(null); setIsRefreshingGps(false); },
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 }
        );
    };

    const handleRefreshGps = () => {
        if (isRefreshingGps) return;
        setIsRefreshingGps(true);
        fetchGpsOnce();
    };

    const formatCoordinates = (loc: LocationData | null): string => {
        if (!loc) return 'No GPS data';
        const lat = Math.abs(loc.latitude).toFixed(4);
        const lng = Math.abs(loc.longitude).toFixed(4);
        return `${lat}° ${loc.latitude >= 0 ? 'N' : 'S'}, ${lng}° ${loc.longitude >= 0 ? 'E' : 'W'}`;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1 — Run on-device ML detection
    // Skip when restoring from cache (user navigated back from NewEntry).
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!photoUri) return;

        // Restored from cache — state is already initialised from props, no re-detection needed.
        if (isRestoredFromCache) return;

        reset();
        setPhase('detecting');
        setLocalMlResult(null);
        setOnlineResult(null);
        setApiErrorMessage(null);
        setIsEditingManually(false);

        (async () => {
            try {
                const result = await detect(photoUri);
                setLocalMlResult(result);
                setManualCommonName(result.commonName);
                setManualScientificName(result.scientificName);
                setPhase('awaiting_confirmation');
            } catch {
                setPhase('detection_error');
            }
        })();
    }, [photoUri]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2 — User confirms ML prediction
    // ─────────────────────────────────────────────────────────────────────────
    const handleConfirmYes = () => {
        navigateToEntry({
            commonName: isEditingManually ? manualCommonName : (localMlResult?.commonName ?? ''),
            scientificName: isEditingManually ? manualScientificName : (localMlResult?.scientificName ?? ''),
            confidenceScore: localMlResult?.confidenceScore ?? 0,
            notes: manualNotes,
            isDraft: false,
            detectionSource: 'offline',
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3 — User rejects ML prediction
    // ─────────────────────────────────────────────────────────────────────────
    const handleConfirmNo = useCallback(async () => {
        setApiErrorMessage(null);

        const netState = await NetInfo.fetch();
        const isOnline = Boolean(netState.isConnected && netState.isInternetReachable !== false);

        if (isOnline) {
            // Online path → call AnimalDetect API via backend
            setPhase('fetching_online');
            try {
                const result = await animalDetectService.detectFromImage(photoUri!);
                if (result) {
                    setOnlineResult(result);
                    setManualCommonName(result.commonName);
                    setManualScientificName(result.scientificName);
                    // Flatten any extra API data into notes
                    const extraNotes = result.extraData && Object.keys(result.extraData).length > 0
                        ? `\nExtra details: ${JSON.stringify(result.extraData, null, 2)}`
                        : '';
                    setManualNotes(extraNotes.trim());
                    setPhase('online_result');
                } else {
                    setApiErrorMessage('The online service could not identify this animal. You can enter the details manually or save as a draft.');
                    setPhase('api_error');
                }
            } catch (err: any) {
                setApiErrorMessage(err.message || 'Online detection failed. You can enter the details manually or save as a draft.');
                setPhase('api_error');
            }
        } else {
            // Offline path → save as draft
            setPhase('offline_draft');
        }
    }, [photoUri]);

    // ─────────────────────────────────────────────────────────────────────────
    // Save as draft (offline or API failure)
    // ─────────────────────────────────────────────────────────────────────────
    const handleSaveAsDraft = () => {
        const draftNote = '[DRAFT: Species identification pending verification]';
        const combinedNotes = manualNotes
            ? `${draftNote}\n${manualNotes}`
            : draftNote;

        navigateToEntry({
            commonName: manualCommonName || localMlResult?.commonName || 'Unknown',
            scientificName: manualScientificName || localMlResult?.scientificName || '',
            confidenceScore: localMlResult?.confidenceScore ?? 0,
            notes: combinedNotes,
            isDraft: true,
            detectionSource: 'offline',
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Continue with online result
    // ─────────────────────────────────────────────────────────────────────────
    const handleSaveOnlineResult = () => {
        if (!onlineResult) return;

        const extraNotes = onlineResult.extraData && Object.keys(onlineResult.extraData).length > 0
            ? `Additional info: ${JSON.stringify(onlineResult.extraData, null, 2)}`
            : '';

        navigateToEntry({
            commonName: isEditingManually ? manualCommonName : onlineResult.commonName,
            scientificName: isEditingManually ? manualScientificName : onlineResult.scientificName,
            confidenceScore: onlineResult.confidence,
            notes: manualNotes || extraNotes,
            isDraft: false,
            detectionSource: 'online',
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Navigate to new journal entry form
    // _returnParams freezes the current detection state so handleBack() restores
    // this exact screen state instead of re-running detection from scratch.
    // ─────────────────────────────────────────────────────────────────────────
    const navigateToEntry = (data: {
        commonName: string;
        scientificName: string;
        confidenceScore: number;
        notes: string;
        isDraft: boolean;
        detectionSource: 'offline' | 'online';
    }) => {
        const restorePhase: Phase =
            phase === 'online_result' ? 'online_result' : 'awaiting_confirmation';

        onNavigate('NewEntry', {
            speciesCommonName: data.commonName,
            speciesScientificName: data.scientificName,
            confidenceScore: data.confidenceScore,
            photoUri,
            observationDate,
            observationTime,
            gpsLocation,
            notes: data.notes,
            isDraft: data.isDraft,
            detectionSource: data.detectionSource,
            // Frozen detection state — restored when user presses Back
            _returnParams: {
                photoUri,
                location: gpsLocation,
                cachedDetectionResult: localMlResult,
                cachedOnlineResult: onlineResult,
                cachedPhase: restorePhase,
                cachedCommonName: data.commonName,
                cachedScientificName: data.scientificName,
                cachedNotes: data.notes,
            },
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Retry ML detection
    // ─────────────────────────────────────────────────────────────────────────
    const handleRetry = () => {
        if (!photoUri) return;
        reset();
        setPhase('detecting');
        setLocalMlResult(null);
        setOnlineResult(null);
        setApiErrorMessage(null);
        setIsEditingManually(false);

        (async () => {
            try {
                const result = await detect(photoUri);
                setLocalMlResult(result);
                setManualCommonName(result.commonName);
                setManualScientificName(result.scientificName);
                setPhase('awaiting_confirmation');
            } catch {
                setPhase('detection_error');
            }
        })();
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Confidence bar helpers
    // ─────────────────────────────────────────────────────────────────────────
    const getConfidenceColor = (score: number) => {
        if (score >= 90) return '#059669';
        if (score >= 70) return '#D97706';
        return '#DC2626';
    };

    const getConfidenceLabel = (score: number) => {
        if (score >= 90) return 'High confidence';
        if (score >= 70) return 'Moderate confidence';
        return 'Low confidence — verify manually';
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Render helpers
    // ─────────────────────────────────────────────────────────────────────────

    const renderDetecting = () => (
        <View style={styles.centeredCard}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={[styles.phaseTitle, { color: theme.text }]}>Analyzing Image</Text>
            <Text style={[styles.phaseSubtitle, { color: theme.textSecondary }]}>
                {getStageText(stage)}
            </Text>
        </View>
    );

    const renderDetectionError = () => (
        <View style={[styles.errorCard, { backgroundColor: theme.card, borderColor: '#FECACA' }]}>
            <FontAwesome6 name="triangle-exclamation" size={40} color="#DC2626" />
            <Text style={styles.errorTitle}>Detection Failed</Text>
            <Text style={styles.errorMessage}>{mlError?.message ?? 'Could not analyze this image.'}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={handleRetry} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: theme.border }]}
                onPress={() => setIsEditingManually(true)}
                activeOpacity={0.7}
            >
                <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Enter Manually</Text>
            </TouchableOpacity>
        </View>
    );

    const renderConfirmation = (result: DetectionResult) => {
        const confColor = getConfidenceColor(result.confidenceScore);
        const isLow = result.confidenceScore < LOW_CONFIDENCE_THRESHOLD;

        return (
            <>
                {/* Prediction card */}
                <View style={[styles.predictionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.predictionLabel, { color: theme.textSecondary }]}>Prediction</Text>
                    <Text style={[styles.commonName, { color: theme.text }]}>{result.commonName}</Text>
                    <Text style={[styles.scientificName, { color: theme.textSecondary }]}>{result.scientificName}</Text>

                    {/* Confidence bar */}
                    <View style={styles.confidenceRow}>
                        <View style={[styles.progressBarBg, { backgroundColor: theme.border }]}>
                            <View style={[styles.progressBarFill, { width: `${result.confidenceScore}%`, backgroundColor: confColor }]} />
                        </View>
                        <Text style={[styles.confidenceValue, { color: confColor }]}>{result.confidenceScore}%</Text>
                    </View>
                    <Text style={[styles.confidenceLabel, { color: confColor }]}>{getConfidenceLabel(result.confidenceScore)}</Text>
                    <Text style={[styles.sourceLabel, { color: theme.textSecondary }]}>On-device ML model</Text>

                    {isLow && (
                        <View style={styles.lowConfidenceBanner}>
                            <FontAwesome6 name="circle-info" size={14} color="#92400E" style={{ marginRight: 6 }} />
                            <Text style={styles.lowConfidenceText}>
                                Low confidence — consider rejecting and using online detection.
                            </Text>
                        </View>
                    )}
                </View>

                {/* Confirmation prompt */}
                <View style={[styles.confirmationCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.confirmQuestion, { color: theme.text }]}>Is this prediction correct?</Text>

                    <TouchableOpacity
                        style={[styles.confirmButton, styles.confirmYes]}
                        onPress={handleConfirmYes}
                        activeOpacity={0.85}
                    >
                        <FontAwesome6 name="check" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={styles.confirmButtonText}>Yes, Correct</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.confirmButton, styles.confirmNo, { borderColor: theme.border }]}
                        onPress={handleConfirmNo}
                        activeOpacity={0.85}
                    >
                        <FontAwesome6 name="xmark" size={16} color="#DC2626" style={{ marginRight: 8 }} />
                        <Text style={[styles.confirmButtonText, { color: '#DC2626' }]}>No, Wrong Prediction</Text>
                    </TouchableOpacity>
                </View>
            </>
        );
    };

    const renderFetchingOnline = () => (
        <View style={styles.centeredCard}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={[styles.phaseTitle, { color: theme.text }]}>Searching Online</Text>
            <Text style={[styles.phaseSubtitle, { color: theme.textSecondary }]}>
                Contacting AnimalDetect API…
            </Text>
        </View>
    );

    const renderOnlineResult = () => {
        if (!onlineResult) return null;
        const confColor = getConfidenceColor(onlineResult.confidence);

        return (
            <>
                <View style={[styles.predictionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.sourceRow}>
                        <FontAwesome6 name="globe" size={14} color="#059669" style={{ marginRight: 6 }} />
                        <Text style={[styles.predictionLabel, { color: '#059669' }]}>AnimalDetect API Result</Text>
                    </View>
                    <Text style={[styles.commonName, { color: theme.text }]}>{onlineResult.commonName}</Text>
                    <Text style={[styles.scientificName, { color: theme.textSecondary }]}>{onlineResult.scientificName}</Text>

                    <View style={styles.confidenceRow}>
                        <View style={[styles.progressBarBg, { backgroundColor: theme.border }]}>
                            <View style={[styles.progressBarFill, { width: `${onlineResult.confidence}%`, backgroundColor: confColor }]} />
                        </View>
                        <Text style={[styles.confidenceValue, { color: confColor }]}>{onlineResult.confidence}%</Text>
                    </View>
                    <Text style={[styles.confidenceLabel, { color: confColor }]}>{getConfidenceLabel(onlineResult.confidence)}</Text>
                </View>

                {/* Manual edit section */}
                {renderManualEditSection()}

                <TouchableOpacity
                    style={[styles.primaryButton, styles.primaryButtonFull]}
                    onPress={handleSaveOnlineResult}
                    activeOpacity={0.85}
                >
                    <FontAwesome6 name="pencil" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryButtonText}>Continue to Journal</Text>
                </TouchableOpacity>
            </>
        );
    };

    const renderOfflineDraft = () => (
        <>
            <View style={[styles.offlineBanner, { backgroundColor: theme.card, borderColor: '#FCD34D' }]}>
                <FontAwesome6 name="wifi" size={20} color="#92400E" style={{ marginBottom: 8 }} />
                <Text style={[styles.offlineTitle, { color: theme.text }]}>You're Offline</Text>
                <Text style={[styles.offlineSubtitle, { color: theme.textSecondary }]}>
                    The online detection service requires an internet connection.
                    You can save this record as a draft and verify the species name once you're back online,
                    or enter the details manually now.
                </Text>
            </View>

            {/* Manual edit section */}
            {renderManualEditSection()}

            <TouchableOpacity
                style={[styles.primaryButton, styles.primaryButtonFull]}
                onPress={handleSaveAsDraft}
                activeOpacity={0.85}
            >
                <FontAwesome6 name="floppy-disk" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.primaryButtonText}>Save as Draft</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.secondaryButton, styles.secondaryButtonFull, { borderColor: theme.border }]}
                onPress={() => setIsEditingManually(true)}
                activeOpacity={0.7}
            >
                <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Enter Details Manually</Text>
            </TouchableOpacity>
        </>
    );

    const renderApiError = () => (
        <>
            <View style={[styles.errorCard, { backgroundColor: theme.card, borderColor: '#FECACA' }]}>
                <FontAwesome6 name="triangle-exclamation" size={36} color="#DC2626" />
                <Text style={styles.errorTitle}>Online Detection Failed</Text>
                <Text style={styles.errorMessage}>{apiErrorMessage}</Text>
            </View>

            {renderManualEditSection()}

            <TouchableOpacity
                style={[styles.primaryButton, styles.primaryButtonFull]}
                onPress={handleSaveAsDraft}
                activeOpacity={0.85}
            >
                <FontAwesome6 name="floppy-disk" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.primaryButtonText}>Save as Draft</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.secondaryButton, styles.secondaryButtonFull, { borderColor: theme.border }]}
                onPress={() => {
                    setIsEditingManually(true);
                    setPhase('awaiting_confirmation');
                }}
                activeOpacity={0.7}
            >
                <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Back to Prediction</Text>
            </TouchableOpacity>
        </>
    );

    // Shared manual edit fields shown during online_result, offline_draft, api_error
    const renderManualEditSection = () => (
        <View style={[styles.manualEditCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.manualEditHeader}>
                <FontAwesome6 name="pen-to-square" size={14} color="#059669" style={{ marginRight: 6 }} />
                <Text style={[styles.manualEditTitle, { color: theme.text }]}>Edit Details</Text>
            </View>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Animal Name</Text>
            <TextInput
                style={[styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                value={manualCommonName}
                onChangeText={setManualCommonName}
                placeholder="e.g. African Elephant"
                placeholderTextColor={theme.textSecondary}
            />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Scientific Name</Text>
            <TextInput
                style={[styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                value={manualScientificName}
                onChangeText={setManualScientificName}
                placeholder="e.g. Loxodonta africana"
                placeholderTextColor={theme.textSecondary}
            />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Notes</Text>
            <TextInput
                style={[styles.textInput, styles.notesInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                value={manualNotes}
                onChangeText={setManualNotes}
                placeholder="Add any additional observations…"
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={3}
            />
        </View>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Main render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar
                barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                backgroundColor={theme.background}
            />

            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <TouchableOpacity
                    style={[styles.backButton, { backgroundColor: theme.border }]}
                    onPress={onBack}
                >
                    <Text style={[styles.backArrow, { color: theme.text }]}>‹</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Observation Details</Text>
                <View style={styles.headerRight} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* Hero Image */}
                <View style={[styles.heroContainer, { backgroundColor: theme.card }]}>
                    {photoUri ? (
                        <Image source={{ uri: photoUri }} style={styles.heroImage} resizeMode="cover" />
                    ) : (
                        <View style={[styles.heroPlaceholder, { backgroundColor: theme.accentLight }]}>
                            <FontAwesome6 name="camera" size={48} color="#059669" />
                        </View>
                    )}
                    {/* Loading overlay during detection / online fetch */}
                    {(phase === 'detecting' || phase === 'fetching_online') && (
                        <View style={styles.imageOverlay}>
                            <ActivityIndicator size="large" color="#FFFFFF" />
                            <Text style={styles.overlayText}>
                                {phase === 'detecting' ? getStageText(stage) : 'Searching online…'}
                            </Text>
                        </View>
                    )}
                    {/* Badge for online result */}
                    {phase === 'online_result' && onlineResult && (
                        <View style={[styles.imageBadge, { backgroundColor: '#059669' }]}>
                            <Text style={styles.imageBadgeText}>Online {onlineResult.confidence}%</Text>
                        </View>
                    )}
                    {/* Badge for confirmed ML result */}
                    {phase === 'awaiting_confirmation' && localMlResult && (
                        <View style={[styles.imageBadge, { backgroundColor: getConfidenceColor(localMlResult.confidenceScore) }]}>
                            <Text style={styles.imageBadgeText}>{localMlResult.confidenceScore}% ML</Text>
                        </View>
                    )}
                    {/* Draft badge */}
                    {phase === 'offline_draft' && (
                        <View style={[styles.imageBadge, { backgroundColor: '#D97706' }]}>
                            <Text style={styles.imageBadgeText}>Draft</Text>
                        </View>
                    )}
                </View>

                {/* Phase-specific content */}
                {phase === 'detecting' && renderDetecting()}
                {phase === 'detection_error' && renderDetectionError()}
                {phase === 'awaiting_confirmation' && localMlResult && renderConfirmation(localMlResult)}
                {phase === 'fetching_online' && renderFetchingOnline()}
                {phase === 'online_result' && renderOnlineResult()}
                {phase === 'offline_draft' && renderOfflineDraft()}
                {phase === 'api_error' && renderApiError()}

                {/* Observation details (always visible) */}
                {phase !== 'detecting' && phase !== 'fetching_online' && (
                    <>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Observation Details</Text>
                        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <View style={styles.detailRow}>
                                <View style={[styles.iconCircle, { backgroundColor: theme.accentLight }]}>
                                    <FontAwesome6 name="calendar" size={18} color="#059669" />
                                </View>
                                <View style={styles.detailContent}>
                                    <Text style={[styles.detailPrimary, { color: theme.text }]}>{observationDate || 'Loading…'}</Text>
                                    <Text style={[styles.detailSecondary, { color: theme.textSecondary }]}>Date observed</Text>
                                </View>
                                <View style={[styles.autoTag, { backgroundColor: theme.accentLight }]}>
                                    <Text style={styles.autoTagText}>Auto</Text>
                                </View>
                            </View>

                            <View style={[styles.divider, { backgroundColor: theme.border }]} />

                            <View style={styles.detailRow}>
                                <View style={[styles.iconCircle, { backgroundColor: theme.accentLight }]}>
                                    <FontAwesome6 name="clock" size={18} color="#059669" />
                                </View>
                                <View style={styles.detailContent}>
                                    <Text style={[styles.detailPrimary, { color: theme.text }]}>{observationTime || 'Loading…'}</Text>
                                    <Text style={[styles.detailSecondary, { color: theme.textSecondary }]}>Time observed</Text>
                                </View>
                                <View style={[styles.autoTag, { backgroundColor: theme.accentLight }]}>
                                    <Text style={styles.autoTagText}>Auto</Text>
                                </View>
                            </View>

                            <View style={[styles.divider, { backgroundColor: theme.border }]} />

                            <View style={styles.detailRow}>
                                <View style={[styles.iconCircle, { backgroundColor: gpsLocation ? theme.accentLight : theme.border }]}>
                                    <FontAwesome6 name="location-dot" size={18} color="#059669" />
                                </View>
                                <View style={styles.detailContent}>
                                    <Text style={[styles.detailPrimary, { color: gpsLocation ? theme.text : theme.textSecondary }]}>
                                        {formatCoordinates(gpsLocation)}
                                    </Text>
                                    <Text style={[styles.detailSecondary, { color: theme.textSecondary }]}>GPS coordinates</Text>
                                </View>
                                <TouchableOpacity
                                    style={[styles.refreshButton, { backgroundColor: theme.border }]}
                                    onPress={handleRefreshGps}
                                    disabled={isRefreshingGps}
                                    activeOpacity={0.7}
                                >
                                    {isRefreshingGps
                                        ? <ActivityIndicator size="small" color="#059669" />
                                        : <FontAwesome6 name="arrows-rotate" size={16} color="#059669" />
                                    }
                                </TouchableOpacity>
                            </View>

                            {!gpsLocation && (
                                <Text style={[styles.gpsHelperText, { color: theme.textSecondary }]}>
                                    Tap refresh to get your location
                                </Text>
                            )}
                        </View>

                        <View style={styles.infoNote}>
                            <FontAwesome6 name="lightbulb" size={16} color="#92400E" style={{ marginRight: 8 }} />
                            <Text style={styles.infoNoteText}>
                                Date & time are recorded automatically. GPS is optional.
                            </Text>
                        </View>
                    </>
                )}

                {/* Spacer for footer */}
                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Rescan button — always visible */}
            <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
                <TouchableOpacity
                    style={[styles.rescanButton, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={onBack}
                    activeOpacity={0.7}
                >
                    <FontAwesome6 name="arrows-rotate" size={15} color="#059669" style={{ marginRight: 6 }} />
                    <Text style={[styles.rescanButtonText, { color: theme.text }]}>Rescan</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 56 : 40,
        paddingBottom: 16,
        borderBottomWidth: 1,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    backArrow: { fontSize: 28, fontWeight: '300', marginTop: -2 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    headerRight: { width: 44 },

    scrollContent: { padding: 20 },

    // Hero
    heroContainer: {
        width: '100%',
        height: 220,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
    },
    heroImage: { width: '100%', height: '100%' },
    heroPlaceholder: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    imageOverlay: {
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    overlayText: { color: '#FFF', fontSize: 15, fontWeight: '600', marginTop: 12 },
    imageBadge: {
        position: 'absolute',
        top: 14,
        right: 14,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    imageBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },

    // Centered phase card (detecting / fetching_online)
    centeredCard: {
        alignItems: 'center',
        paddingVertical: 28,
        marginBottom: 20,
    },
    phaseTitle: { fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 6 },
    phaseSubtitle: { fontSize: 14 },

    // Error card
    errorCard: {
        borderRadius: 16,
        padding: 24,
        marginBottom: 16,
        alignItems: 'center',
        borderWidth: 1,
    },
    errorTitle: { fontSize: 17, fontWeight: '700', color: '#DC2626', marginTop: 12, marginBottom: 6 },
    errorMessage: { fontSize: 13, color: '#7F1D1D', textAlign: 'center', marginBottom: 18, lineHeight: 20 },

    // Prediction card
    predictionCard: {
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    predictionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    commonName: { fontSize: 26, fontWeight: '700', marginBottom: 4, letterSpacing: -0.3 },
    scientificName: { fontSize: 16, fontStyle: 'italic', marginBottom: 14 },
    confidenceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    progressBarBg: { flex: 1, height: 8, borderRadius: 4, marginRight: 10, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 4 },
    confidenceValue: { fontSize: 17, fontWeight: '700', minWidth: 44, textAlign: 'right' },
    confidenceLabel: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
    sourceLabel: { fontSize: 12, marginTop: 4 },
    sourceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    lowConfidenceBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#FEF3C7',
        borderRadius: 10,
        padding: 10,
        marginTop: 12,
    },
    lowConfidenceText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },

    // Confirmation card
    confirmationCard: {
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    confirmQuestion: { fontSize: 17, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
    confirmButton: {
        height: 52,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    confirmYes: { backgroundColor: '#059669' },
    confirmNo: { backgroundColor: 'transparent', borderWidth: 1.5 },
    confirmButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },

    // Offline draft banner
    offlineBanner: {
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#FCD34D',
        alignItems: 'center',
    },
    offlineTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
    offlineSubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

    // Manual edit card
    manualEditCard: {
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
    },
    manualEditHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    manualEditTitle: { fontSize: 15, fontWeight: '600' },
    fieldLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
    textInput: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
        marginBottom: 14,
    },
    notesInput: { height: 80, textAlignVertical: 'top' },

    // Buttons
    primaryButton: {
        backgroundColor: '#059669',
        borderRadius: 12,
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
    primaryButtonFull: { marginHorizontal: 0 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    secondaryButton: {
        borderRadius: 12,
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        marginBottom: 10,
    },
    secondaryButtonFull: { marginHorizontal: 0 },
    secondaryButtonText: { fontSize: 15, fontWeight: '600' },

    // Observation details card
    sectionTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12, marginTop: 8 },
    card: {
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
    iconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    detailContent: { flex: 1 },
    detailPrimary: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
    detailSecondary: { fontSize: 12 },
    divider: { height: 1, marginVertical: 12, marginLeft: 60 },
    autoTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    autoTagText: { fontSize: 11, fontWeight: '600', color: '#059669' },
    refreshButton: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    gpsHelperText: { fontSize: 12, marginTop: 4, marginLeft: 60, fontStyle: 'italic' },

    // Info note
    infoNote: {
        flexDirection: 'row',
        backgroundColor: '#FEF3C7',
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
        alignItems: 'flex-start',
    },
    infoNoteText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },

    // Footer
    footer: {
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 36 : 20,
        borderTopWidth: 1,
    },
    rescanButton: {
        height: 48,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
    },
    rescanButtonText: { fontSize: 15, fontWeight: '600' },
});

export default IdentificationResultScreen;
