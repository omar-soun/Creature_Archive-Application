/**
 * API Configuration
 *
 * Centralized API base URL and platform-specific configuration.
 */

import { Platform } from 'react-native';

// ──────────────────────────────────────────────────────────────────────
// API Configuration
// ──────────────────────────────────────────────────────────────────────
// For PHYSICAL DEVICE testing: replace with your computer's local IP.
// Find it with:  ipconfig (Windows)  |  ifconfig / ip addr (Mac/Linux)
// Example: 'http://192.168.1.42:8000'
//
// For EMULATOR testing: the defaults below work automatically.
// ──────────────────────────────────────────────────────────────────────
const DEV_MACHINE_IP = '192.168.254.181'; // ← CHANGE to your computer's local IP

export const API_BASE_URL = __DEV__
  ? Platform.select({
      android: `http://${DEV_MACHINE_IP}:8000`, // Physical device + emulator
      ios: 'http://localhost:8000',              // iOS simulator
      default: `http://${DEV_MACHINE_IP}:8000`,
    })!
  : 'https://your-production-api.com'; // Replace with production URL
