/**
 * Local Storage Service — Facade
 *
 * This module re-exports the file-based storage service so that all existing
 * imports (`import { localStorageService } from './localStorageService'`)
 * continue to work without any changes.
 *
 * The actual implementation lives in fileStorageService.ts which uses
 * react-native-fs for persistent file-system storage instead of AsyncStorage.
 */

import { fileStorageService } from './fileStorageService';

export const localStorageService = fileStorageService;
