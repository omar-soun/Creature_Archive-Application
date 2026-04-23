# Creature Archive

A mobile application for identifying, cataloguing, and journaling wildlife encounters. Point your camera at an animal to get an instant AI-powered species identification, then save it to your personal archive with notes, location, and photos.

---

## Features

- **On-device species detection** — MobileNetV2 TFLite model runs entirely on the device (no internet required for scanning)
- **Cloud-backed archive** — Firestore stores all journal entries, synced across devices
- **Offline-first** — entries created offline are queued and synced automatically when connectivity is restored
- **Photo journal** — attach photos to each sighting, stored in Firebase Storage
- **Statistics dashboard** — visualize your sightings by class, date, and location
- **Authentication** — email/password sign-up and login via Firebase Auth

---

## Tech Stack

| Layer               | Technology                                                                |
| ------------------- | ------------------------------------------------------------------------- |
| Mobile framework    | React Native 0.83.1 (CLI, not Expo)                                       |
| Language            | TypeScript 5                                                              |
| UI                  | React 19.2, React Native Vector Icons (FontAwesome6)                      |
| Camera              | React Native Vision Camera v4                                             |
| ML inference        | `react-native-fast-tflite` (MobileNetV2 `.tflite` model)                  |
| Auth / DB / Storage | Firebase Auth, Firestore, Firebase Storage (via `@react-native-firebase`) |
| Offline storage     | React Native FS (file system) + AsyncStorage                              |
| Backend API         | FastAPI (Python 3.11) + Uvicorn                                           |
| Backend auth        | Firebase Admin SDK (service account)                                      |
| External API        | AnimalDetect API (server-side proxy)                                      |

---

## Project Structure

```
Creature_Archive Application/
├── frontEnd/                    # React Native app
│   ├── src/
│   │   ├── core/
│   │   │   ├── config/          # api.ts (API URL), firebase.ts
│   │   │   ├── theme/           # ThemeContext, colors, fonts
│   │   │   ├── alerts/          # Global alert context
│   │   │   └── types/           # Shared TypeScript types
│   │   ├── features/
│   │   │   ├── auth/            # Login, Register, Password Reset screens
│   │   │   ├── scan/            # Camera + ML inference
│   │   │   ├── journal/         # Entry creation and editing
│   │   │   ├── archive/         # Browse and filter past sightings
│   │   │   ├── stats/           # Statistics charts
│   │   │   ├── profile/         # User profile management
│   │   │   └── home/            # Home dashboard
│   │   ├── services/
│   │   │   ├── api/             # HTTP client (Fetch wrapper)
│   │   │   ├── storage/         # Local file system helpers
│   │   │   └── sync/            # syncManager.ts — offline queue
│   │   ├── navigation/          # AppRoute, TabRoute, AuthScreen types
│   │   ├── shared/
│   │   │   └── components/      # BottomTabBar, OfflineIndicator
│   │   ├── model/
│   │   │   ├── creature_archive_model.tflite   # On-device ML model
│   │   │   └── species_data.json               # Label map
│   │   └── assets/              # Images and icons
│   ├── android/
│   │   └── app/
│   │       └── google-services.json   # Firebase Android config
│   ├── ios/
│   │   └── frontEnd/
│   │       └── GoogleService-Info.plist  # Firebase iOS config (add manually)
│   ├── App.tsx                  # Navigation hub and app entry
│   └── package.json
│
├── Backend/                     # FastAPI backend
│   ├── app/
│   │   ├── core/                # Config, Firebase init, DI, exceptions
│   │   ├── features/
│   │   │   ├── auth/            # Login, register, password reset endpoints
│   │   │   ├── entries/         # Journal entry CRUD
│   │   │   ├── images/          # Image upload and retrieval
│   │   │   ├── sync/            # Offline sync endpoint
│   │   │   ├── species/         # Species data endpoint
│   │   │   └── health/          # Health check
│   │   ├── data/                # species_data.json (backend copy)
│   │   ├── main.py              # FastAPI app factory (lifespan)
│   │   └── service-account.json # Firebase service account (add manually)
│   ├── requirements.txt
│   └── .env                     # Backend environment variables
│
├── firestore.rules              # Firestore security rules
└── firestore.indexes.json       # Firestore composite indexes
```

---

## Prerequisites

Make sure the following are installed before starting:

| Tool           | Version | Notes                                   |
| -------------- | ------- | --------------------------------------- |
| Node.js        | >= 20   | [nodejs.org](https://nodejs.org)        |
| npm            | >= 10   | Comes with Node                         |
| Python         | 3.11.x  | [python.org](https://python.org)        |
| Java JDK       | 17      | Required for Android builds             |
| Android Studio | Latest  | Includes Android SDK and emulator       |
| Xcode          | 15+     | macOS only, for iOS builds              |
| CocoaPods      | Latest  | iOS only — `sudo gem install cocoapods` |

Also complete the official React Native environment setup guide before continuing:
[reactnative.dev/docs/set-up-your-environment](https://reactnative.dev/docs/set-up-your-environment)

---

## Firebase Setup

The app uses Firebase for authentication, database, and file storage. You need your own Firebase project.

### 1. Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → give it a name → follow the wizard
3. Enable these services in the Firebase console:
   - **Authentication** → Sign-in method → **Email/Password** → Enable
   - **Firestore Database** → Create database → choose a region
   - **Storage** → Get started

### 2. Add the Android App

1. In the Firebase console → Project settings → **Add app** → Android
2. Enter package name: `com.frontend`
3. Download **`google-services.json`**
4. Place it at: `frontEnd/android/app/google-services.json`

### 3. Add the iOS App (macOS only)

1. Firebase console → Add app → iOS
2. Enter bundle ID: `com.frontend` (or whatever is in your Xcode project)
3. Download **`GoogleService-Info.plist`**
4. Open Xcode → drag the file into `frontEnd/ios/frontEnd/` → check "Copy items if needed"

### 4. Create a Service Account (for the Backend)

1. Firebase console → Project settings → **Service accounts** tab
2. Click **Generate new private key** → download the JSON file
3. Rename it to `service-account.json` and place it at: `Backend/app/service-account.json`

> **Important:** Never commit `service-account.json` or `google-services.json` to a public repository. Add them to `.gitignore`.

### 5. Deploy Firestore Rules and Indexes

From the project root:

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # select your project
firebase deploy --only firestore
```

---

## Backend Setup

### 1. Navigate to the backend folder

```bash
cd Backend
```

### 2. Create and activate a virtual environment

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python -m venv venv
source venv/bin/activate
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

Create a `.env` file inside `Backend/`:

```bash
cp .env.example .env   # if the example exists, otherwise create it manually
```

Then open `Backend/.env` and fill in your values (see the **Environment Variables** section below).

### 5. Find your local IP address

The mobile app connects to the backend over your local network. You need your machine's local IP.

```bash
# Windows
ipconfig
# Look for "IPv4 Address" under your active adapter (e.g. 192.168.1.42)

# macOS / Linux
ifconfig | grep "inet "
# or
ip addr show
```

### 6. Start the backend server

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The `--host 0.0.0.0` flag is required so that devices on your local network (including your phone) can reach the server. Without it the server only accepts connections from `localhost`.

You should see:

```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

---

## Frontend Setup

### 1. Navigate to the frontend folder

```bash
cd frontEnd
```

### 2. Install JavaScript dependencies

```bash
npm install
```

### 3. Install iOS pods (macOS only)

```bash
cd ios && pod install && cd ..
```

### 4. Update the API base URL

Open [frontEnd/src/core/config/api.ts](src/core/config/api.ts) and replace the IP address with the one you found in step 5 of the backend setup:

```typescript
const DEV_MACHINE_IP = '192.168.1.42'; // ← replace with YOUR machine's local IP
```

Leave everything else in that file unchanged.

### 5. Start Metro (the JS bundler)

```bash
npm start
```

Keep this terminal running. Open a second terminal for the next step.

### 6. Run on Android

Make sure a device is connected via USB (with USB debugging enabled) or an emulator is running in Android Studio.

```bash
npm run android
# or
npx react-native run-android
```

### 7. Run on iOS (macOS only)

```bash
npm run ios
# or
npx react-native run-ios
```

---

## Environment Variables

### Backend — `Backend/.env`

Create this file based on the template below. All fields are required unless marked optional.

```env
# ── Firebase ──────────────────────────────────────────────────────────
# Path to the service account JSON file you downloaded from Firebase console
GOOGLE_APPLICATION_CREDENTIALS=app/service-account.json

# Your Firebase Storage bucket name (found in Firebase console → Storage)
# Format: your-project-id.appspot.com  OR  your-project-id.firebasestorage.app
FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app

# ── AnimalDetect API ──────────────────────────────────────────────────
# API key from animaldetect.com (server-side only, never exposed to the app)
ANIMAL_DETECT_API_KEY=your_animal_detect_api_key_here

# AnimalDetect endpoint (usually does not need to change)
ANIMAL_DETECT_API_URL=https://www.animaldetect.com/api/v1/detect

# ── Optional ──────────────────────────────────────────────────────────
# Set to true to enable verbose request/response logging
# DEBUG=false
```

Save this as `Backend/.env.example` for other developers (with placeholder values, not real keys).

| Variable                         | Required | Description                                        |
| -------------------------------- | -------- | -------------------------------------------------- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes      | Relative path to `service-account.json`            |
| `FIREBASE_STORAGE_BUCKET`        | Yes      | Firebase Storage bucket (from Firebase console)    |
| `ANIMAL_DETECT_API_KEY`          | Yes      | API key from AnimalDetect — server-side proxy only |
| `ANIMAL_DETECT_API_URL`          | Yes      | AnimalDetect API endpoint URL                      |
| `DEBUG`                          | No       | Set `true` for verbose logging                     |

### Frontend — no `.env` file needed

The frontend has no `.env` file. The only value you need to change is the IP address in [frontEnd/src/core/config/api.ts](src/core/config/api.ts) as described in the setup steps above.

Firebase configuration comes from `google-services.json` (Android) and `GoogleService-Info.plist` (iOS), which are loaded automatically by the `@react-native-firebase` library.

---

## Configuration Changes Checklist

Before running the app, confirm you have done all of the following:

- [ ] Placed `google-services.json` at `frontEnd/android/app/google-services.json`
- [ ] Placed `GoogleService-Info.plist` at `frontEnd/ios/frontEnd/GoogleService-Info.plist` (iOS only)
- [ ] Placed `service-account.json` at `Backend/app/service-account.json`
- [ ] Created `Backend/.env` with all required variables filled in
- [ ] Updated `DEV_MACHINE_IP` in `frontEnd/src/core/config/api.ts`
- [ ] Started the backend with `--host 0.0.0.0`
- [ ] Phone/emulator and development machine are on the same Wi-Fi network

---

## How to Run

### Development mode

**Terminal 1 — Backend:**

```bash
cd Backend
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Metro bundler:**

```bash
cd frontEnd
npm start
```

**Terminal 3 — Android or iOS:**

```bash
cd frontEnd
npm run android   # Android
npm run ios       # iOS (macOS only)
```

### Production

The backend can be deployed to any server that supports Python (e.g. a VPS, Railway, Render, or Cloud Run).

1. Set the environment variables on your server (do not copy the `.env` file directly — use your host's secrets management).
2. Start the server without `--reload`: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
3. In `frontEnd/src/core/config/api.ts`, change the production URL: `'https://your-production-api.com'`
4. Build a release APK: `cd frontEnd/android && ./gradlew assembleRelease`

---

## Common Errors and Fixes

### `Network request failed` / `ECONNREFUSED` on physical device

**Cause:** The backend URL is wrong or the server is not reachable.

**Fix:**

1. Make sure the backend is running with `--host 0.0.0.0` (not just `localhost`).
2. Confirm the IP in `api.ts` matches your machine's current local IP (`ipconfig` / `ifconfig`).
3. Confirm your phone and computer are on the **same Wi-Fi network**.
4. Check your firewall — temporarily disable it or add an inbound rule for port 8000.

---

### `Metro: could not connect` on emulator

**Fix:** Use the Android emulator default gateway. In `api.ts`, Android emulators reach the host machine at `10.0.2.2`:

```typescript
android: 'http://10.0.2.2:8000',
```

---

### `google-services.json not found` (Android build error)

**Fix:** Download `google-services.json` from your Firebase project (Project settings → Your apps → Android) and place it at `frontEnd/android/app/google-services.json`.

---

### `FirebaseApp: Firebase app named '[DEFAULT]' already exists`

**Fix:** This is a hot-reload artifact. Restart Metro (`npm start -- --reset-cache`) and rebuild.

---

### `ModuleNotFoundError: No module named 'firebase_admin'`

**Fix:** Your virtual environment is not active, or dependencies are not installed.

```bash
# Activate venv first, then:
pip install -r requirements.txt
```

---

### `ValueError: Invalid Firebase credentials`

**Fix:** The path in `GOOGLE_APPLICATION_CREDENTIALS` is wrong, or `service-account.json` is missing or malformed. Confirm the file exists at `Backend/app/service-account.json` and re-download from Firebase if needed.

---

### `pod install` fails on iOS

**Fix:**

```bash
cd frontEnd/ios
pod deintegrate
pod install
```

If that still fails, make sure CocoaPods is up to date: `sudo gem install cocoapods`.

---

### TypeScript errors on `iconStyle` prop (FontAwesome6)

These are **known pre-existing type mismatches** in `@react-native-vector-icons`. They do not affect runtime behavior and can be ignored. Do not attempt to fix them by changing icon usage.

---

## Author

**Omar Soun** — [Github](https://github.com/omar-soun)
