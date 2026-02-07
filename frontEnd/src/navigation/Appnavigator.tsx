import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';

// Import screens
import SplashScreen from '../screens/SplashScreen';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import HomeScreen from '../screens/HomeScreen';
import ArchiveScreen from '../screens/ArchiveScreen';
import StatsScreen from '../screens/StatsScreen';
import ProfileScreen from '../screens/ProfileScreen';

// Import types
import { TabRoute } from '../components/BottomTabBar';

type AppScreen = 'Splash' | 'SignIn' | 'SignUp' | 'Main';

const AppNavigator: React.FC = () => {
  // Auth flow state
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('Splash');
  
  // Tab navigation state (for main app)
  const [currentTab, setCurrentTab] = useState<TabRoute>('Home');

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
  };

  // Handle tab navigation
  const handleTabNavigate = (route: TabRoute) => {
    setCurrentTab(route);
  };

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

  // Render main app with tab navigation
  const renderMainApp = () => {
    switch (currentTab) {
      case 'Home':
        return <HomeScreen onNavigate={handleTabNavigate} />;
      
      case 'Archive':
        return <ArchiveScreen onNavigate={handleTabNavigate} />;
      
      case 'Stats':
        return <StatsScreen onNavigate={handleTabNavigate} />;
      
      case 'Profile':
        return (
          <ProfileScreen
            onNavigate={handleTabNavigate}
            // onSignOut={handleSignOut}
          />
        );
      
      default:
        return <HomeScreen onNavigate={handleTabNavigate} />;
    }
  };

  return <View style={styles.container}>{renderScreen()}</View>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default AppNavigator;