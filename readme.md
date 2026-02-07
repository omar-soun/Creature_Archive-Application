# Creature Archive Application - Developer Setup Guide

## Prerequisites

- Node.js and npm installed
- Python 3.8+ with pip
- Android SDK (for mobile development)
- Wi-Fi network access (phone and computer on same network)

## Backend Setup

### 1. Install Dependencies

```bash
cd Backend
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create a `.env` file in the Backend folder with your Firebase credentials (see `.env.example`).

### 3. Start the Backend Server

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Important:** The `--host 0.0.0.0` flag is critical — without it, uvicorn only listens on 127.0.0.1 and will reject connections from other devices.

## Frontend Setup

### 1. Find Your Computer's Local IP Address

Open a terminal and run:

```bash
ipconfig
```

Look for "IPv4 Address" under your Wi-Fi adapter (e.g., 192.168.1.42).

### 2. Update the API Service Configuration

Open `frontEnd/src/services/apiService.ts` and update line 24:

```typescript
const DEV_MACHINE_IP = "192.168.x.x"; // ← Update with your actual IP from step 1
```

### 3. Install Dependencies

```bash
cd frontEnd
npm install
```

### 4. Network Requirements

Ensure your phone and computer are connected to the same Wi-Fi network.

### 5. Build and Run

Since native manifest changes require a full rebuild (Metro hot reload won't pick them up):

```bash
npx react-native run-android
```

## Data Sync & Caching

- Profile data sent during signup is cached locally
- If the backend is unreachable during signup, the retry mechanism automatically sends cached data on the next app launch
- All Firestore writes are logged in the backend console

## Troubleshooting

- **Connection refused?** Verify backend is running with `--host 0.0.0.0`
- **Still can't connect?** Check firewall settings and confirm both devices are on the same Wi-Fi
- **Data not syncing?** Check backend logs and ensure `.env` has correct Firebase credentials
