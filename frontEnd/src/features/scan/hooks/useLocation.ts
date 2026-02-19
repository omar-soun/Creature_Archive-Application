import { useState, useCallback } from 'react';
import { Platform, Linking } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

interface LocationData {
    latitude: number;
    longitude: number;
}

interface UseLocationParams {
    showAlert: (title: string, message?: string, buttons?: any[]) => void;
}

export const useLocation = ({ showAlert }: UseLocationParams) => {
    // Location State
    const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
    const [locationServiceChecked, setLocationServiceChecked] = useState(false);

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
                    showAlert(
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

    // Format coordinates for display
    const formatCoordinates = (location: LocationData | null): string => {
        if (!location) return '';
        const lat = Math.abs(location.latitude).toFixed(4);
        const lng = Math.abs(location.longitude).toFixed(4);
        const latDir = location.latitude >= 0 ? 'N' : 'S';
        const lngDir = location.longitude >= 0 ? 'E' : 'W';
        return `${lat}° ${latDir}, ${lng}° ${lngDir}`;
    };

    return {
        currentLocation,
        locationServiceChecked,
        checkLocationServiceEnabled,
        startLocationWatcher,
        formatCoordinates,
    };
};
