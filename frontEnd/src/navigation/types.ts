/**
 * Navigation Type Definitions
 *
 * Centralized route and navigation state types used across the app.
 */

// Tab routes used by BottomTabBar
export type TabRoute = 'Home' | 'Archive' | 'Stats' | 'Profile';

// Auth screens
export type AuthScreen = 'Splash' | 'SignIn' | 'SignUp' | 'ForgotPassword';

// All navigable routes in the app
export type AppRoute = TabRoute | 'ScanSpecies' | 'IdentificationResult' | 'NewEntry' | 'JournalDetail' | 'EditEntry';

// App state with navigation history
export interface MainState {
  main: AppRoute;
  params?: any;
  previousMain?: AppRoute;
  previousParams?: any;
}

export type AppState = { auth: AuthScreen } | MainState;
