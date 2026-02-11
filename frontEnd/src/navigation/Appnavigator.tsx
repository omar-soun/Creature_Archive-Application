import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemeProvider } from '../context/ThemeContext';

// Import screens
import SplashScreen from '../screens/SplashScreen';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import HomeScreen from '../screens/HomeScreen';
import ArchiveScreen from '../screens/ArchiveScreen';
import StatsScreen from '../screens/StatsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ScanSpeciesScreen from '../screens/ScanSpeciesScreen';
import JournalDetailScreen from '../screens/JournalDetailScreen';

// Import types
import { TabRoute } from '../components/BottomTabBar';

type AppScreen = 'Splash' | 'SignIn' | 'SignUp' | 'Main';
type OverlayScreen = 'ScanSpecies' | 'JournalDetail' | null;

const AppNavigator: React.FC = () => {
  // Auth flow state
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('Splash');

  // Tab navigation state (for main app)
  const [currentTab, setCurrentTab] = useState<TabRoute>('Home');

  // Overlay screen state (screens that sit on top of tabs)
  const [overlayScreen, setOverlayScreen] = useState<OverlayScreen>(null);
  const [overlayParams, setOverlayParams] = useState<any>(null);

  // Handle splash screen completion
  const handleSplashFinish = () => {
    setCurrentScreen('SignIn');
  };

  // Handle sign in
  const handleSignIn = () => {
    setCurrentScreen('Main');
    setCurrentTab('Home');
  };

  // Handle sign up
  const handleSignUp = () => {
    setCurrentScreen('Main');
    setCurrentTab('Home');
  };

  // Navigate to sign up from sign in
  const navigateToSignUp = () => {
    setCurrentScreen('SignUp');
  };

  // Navigate to sign in from sign up
  const navigateToSignIn = () => {
    setCurrentScreen('SignIn');
  };

  // Handle sign out
  const handleSignOut = () => {
    setCurrentScreen('SignIn');
    setCurrentTab('Home');
    setOverlayScreen(null);
    setOverlayParams(null);
  };

  // Handle navigation (tabs + overlay screens)
  const handleNavigate = useCallback((route: any, params?: any) => {
    const tabRoutes: TabRoute[] = ['Home', 'Archive', 'Stats', 'Profile'];

    if (tabRoutes.includes(route)) {
      setOverlayScreen(null);
      setOverlayParams(null);
      setCurrentTab(route as TabRoute);
    } else if (route === 'ScanSpecies' || route === 'JournalDetail') {
      setOverlayScreen(route as OverlayScreen);
      setOverlayParams(params || null);
    }
  }, []);

  // Handle back from overlay screens
  const handleOverlayBack = useCallback(() => {
    setOverlayScreen(null);
    setOverlayParams(null);
  }, []);

  // Render current screen
  const renderScreen = () => {
    switch (currentScreen) {
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

      case 'Main':
        return renderMainApp();

      default:
        return <SplashScreen onFinish={handleSplashFinish} />;
    }
  };

  // Render main app with tab navigation + overlay screens
  const renderMainApp = () => {
    // Overlay screens take priority
    if (overlayScreen === 'ScanSpecies') {
      return (
        <ScanSpeciesScreen
          onNavigate={handleNavigate}
          onBack={handleOverlayBack}
        />
      );
    }

    if (overlayScreen === 'JournalDetail') {
      return (
        <JournalDetailScreen
          onNavigate={handleNavigate}
          onBack={handleOverlayBack}
          routeParams={overlayParams}
        />
      );
    }

    switch (currentTab) {
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
            // onSignOut={handleSignOut}
          />
        );

      default:
        return <HomeScreen onNavigate={handleNavigate} />;
    }
  };

  return (
    <ThemeProvider>
      <View style={styles.container}>{renderScreen()}</View>
    </ThemeProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default AppNavigator;
