/**
 * Creature Archive - Main App Entry
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import authService from './src/services/authService';
import { migrationService } from './src/services/migrationService';
import { fileStorageService } from './src/services/fileStorageService';
import { speciesService } from './src/services/speciesService'; // Eager load species data at startup
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

// Screen imports
import SplashScreen from './src/screens/SplashScreen';
import SignInScreen from './src/screens/SignInScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import HomeScreen from './src/screens/HomeScreen';
import ArchiveScreen from './src/screens/ArchiveScreen';
import StatsScreen from './src/screens/StatsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ScanSpeciesScreen from './src/screens/ScanSpeciesScreen';
import IdentificationResultScreen from './src/screens/IdentificationResultScreen';
import NewJournalEntryScreen from './src/screens/NewJournalEntryScreen';
import JournalDetailScreen from './src/screens/JournalDetailScreen';
import EditJournalEntryScreen from './src/screens/EditJournalEntryScreen'; 

// Types
import { TabRoute } from './src/components/BottomTabBar';

// Route Types
type AuthScreen = 'Splash' | 'SignIn' | 'SignUp';
export type AppRoute = TabRoute | 'ScanSpecies' | 'IdentificationResult' | 'NewEntry' | 'JournalDetail' | 'EditEntry';

// App State with navigation history
interface MainState {
  main: AppRoute;
  params?: any;
  previousMain?: AppRoute;
  previousParams?: any;
}

type AppState = { auth: AuthScreen } | MainState;

const AppContent: React.FC = () => {
  const { isThemeLoaded } = useTheme();
  const [appState, setAppState] = useState<AppState>({ auth: 'Splash' });
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [isMigrated, setIsMigrated] = useState(false);

  // Run one-time migration from AsyncStorage to file-based storage
  useEffect(() => {
    const runMigration = async () => {
      try {
        await fileStorageService.ensureDirectories();
        await migrationService.migrateIfNeeded();

        // Verify species data loaded at startup
        console.log(`[App] Species service ready: ${speciesService.getSpeciesCount()} species`);
      } catch (error) {
        console.warn('Migration error (app will continue):', error);
      } finally {
        setIsMigrated(true);
      }
    };
    runMigration();
  }, []);

  // Listen for authentication state changes
  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = authService.onAuthStateChanged((user) => {
      if (user) {
        // User is signed in, navigate to main app
        setAppState({ main: 'Home' });

        // Retry sending cached profile if signup backend call failed previously
        authService.retryCachedProfileCreation();
      } else {
        // User is signed out, show sign in screen
        setAppState({ auth: 'SignIn' });
      }
      setIsAuthChecked(true);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // Show splash screen while checking auth state
  useEffect(() => {
    if (!isAuthChecked) {
      // Show splash for minimum 1.5 seconds for better UX
      const timer = setTimeout(() => {
        if (!isAuthChecked) {
          // If auth check is taking too long, still show splash
          // The auth listener will update the state when ready
        }
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [isAuthChecked]);

  // ============================================
  // AUTH NAVIGATION HANDLERS
  // ============================================
  const handleSplashFinish = () => {
    setAppState({ auth: 'SignIn' });
  };

  const handleSignIn = () => {
    setAppState({ main: 'Home' });
  };

  const handleSignUp = () => {
    setAppState({ main: 'Home' });
  };

  const navigateToSignUp = () => {
    setAppState({ auth: 'SignUp' });
  };

  const navigateToSignIn = () => {
    setAppState({ auth: 'SignIn' });
  };

  const handleSignOut = async () => {
    try {
      await authService.signOut();
      // Auth state listener will automatically navigate to SignIn
    } catch (error) {
      console.error('Sign out error:', error);
      // Force navigation to SignIn even if signOut fails
      setAppState({ auth: 'SignIn' });
    }
  };

  // ============================================
  // MAIN NAVIGATION HANDLER
  // ============================================
  const handleNavigate = (route: AppRoute, params?: any) => {
    console.log('Navigating to:', route, params ? 'with params' : '');

    setAppState((prevState) => {
      // Save current route for back navigation (1-level history)
      if ('main' in prevState) {
        return {
          main: route,
          params,
          previousMain: prevState.main,
          previousParams: prevState.params,
        };
      }
      return { main: route, params };
    });
  };

  // ============================================
  // BACK NAVIGATION HANDLER
  // ============================================
  const handleBack = () => {
    setAppState((prevState) => {
      if ('main' in prevState && prevState.previousMain) {
        return {
          main: prevState.previousMain,
          params: prevState.previousParams,
          previousMain: undefined,
          previousParams: undefined,
        };
      }
      // Default fallback to Home
      return { main: 'Home' };
    });
  };

  // ============================================
  // RENDER CURRENT SCREEN
  // ============================================
  const renderScreen = () => {
    // Wait for theme + auth + migration before rendering
    if (!isThemeLoaded || !isAuthChecked || !isMigrated) {
      return <SplashScreen onFinish={() => {}} />;
    }

    // Auth screens
    if ('auth' in appState) {
      switch (appState.auth) {
        case 'Splash':
          return <SplashScreen onFinish={handleSplashFinish} />;
        case 'SignIn':
          return (
            <SignInScreen
              onSignIn={handleSignIn}
              onNavigateToSignUp={navigateToSignUp}
            />
          );
        case 'SignUp':
          return (
            <SignUpScreen
              onSignUp={handleSignUp}
              onNavigateToSignIn={navigateToSignIn}
            />
          );
      }
    }

    // Main app screens
    if ('main' in appState) {
      const { main, params } = appState;

      switch (main) {
        case 'ScanSpecies':
          return (
            <ScanSpeciesScreen
              onNavigate={handleNavigate}
              onBack={handleBack}
            />
          );

        case 'IdentificationResult':
          return (
            <IdentificationResultScreen
              onNavigate={handleNavigate}
              onBack={handleBack}
              photoUri={params?.photoUri}
              location={params?.location}
              timestamp={params?.timestamp}
            />
          );

        case 'NewEntry':
          return (
            <NewJournalEntryScreen
              onNavigate={handleNavigate}
              onBack={handleBack}
              routeParams={params}
            />
          );

        case 'JournalDetail':
          return (
            <JournalDetailScreen
              onNavigate={handleNavigate}
              onBack={handleBack}
              routeParams={params}
            />
          );

        case 'EditEntry':
          return (
            <EditJournalEntryScreen
              onNavigate={handleNavigate}
              onBack={handleBack}
              routeParams={params}
            />
          );

        case 'Home':
          return <HomeScreen onNavigate={handleNavigate} />;

        case 'Archive':
          return <ArchiveScreen onNavigate={handleNavigate} />;

        case 'Stats':
          return <StatsScreen onNavigate={handleNavigate} />;

        case 'Profile':
          return (
            <ProfileScreen
              onNavigate={handleNavigate}
              onSignOut={handleSignOut}
            />
          );

        default:
          return <HomeScreen onNavigate={handleNavigate} />;
      }
    }

    return <SplashScreen onFinish={handleSplashFinish} />;
  };

  return renderScreen();
};

const App: React.FC = () => (
  <ThemeProvider>
    <AppContent />
  </ThemeProvider>
);

export default App;