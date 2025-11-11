# Firebase SSO Setup Instructions

## Overview
This document explains how to enable Firebase SSO authentication for the Product GPT Chat application.

## Firebase Project
- **Project ID**: `pulsepoint-bitstrapped-ai`
- **Project URL**: https://console.firebase.google.com/u/0/project/pulsepoint-bitstrapped-ai

## Service Account Access

The backend service account (`productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com`) needs access to verify Firebase ID tokens. 

### Option 1: Grant Service Account Access (Recommended)

You need to grant the service account permission to verify Firebase tokens. This can be done by:

1. **Using Firebase Admin SDK** (requires Firebase Admin role):
   - Go to Firebase Console → Project Settings → Service Accounts
   - Generate a new service account key OR
   - Grant the existing GCP service account Firebase Admin permissions

2. **Or use Google Cloud IAM**:
   - The service account needs the `roles/firebase.admin` role OR
   - The `roles/iam.serviceAccountTokenCreator` role to verify tokens

### Option 2: Manual Setup (If you have Firebase Admin access)

If you have Firebase Admin access, you can:
1. Go to Firebase Console → Project Settings → Service Accounts
2. Generate a new service account key
3. Store it as a GCP Secret: `firebase-admin-key`
4. Update the backend to use Firebase Admin SDK instead

## Current Implementation

The backend uses `google-auth` library to verify Firebase ID tokens. This works without Firebase Admin SDK, but requires:
- The Firebase project ID to be set as an environment variable
- The token issuer to match `https://securetoken.google.com/{project-id}`

## Environment Variables Needed

### Backend (Cloud Run)
- `FIREBASE_PROJECT_ID=pulsepoint-bitstrapped-ai` (already set as default)
- `ENABLE_SSO=true` (to enable SSO)

### Frontend (Cloud Run)
- `NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyB5g8EI16p2waqesbR0JvBymbNBhg5t6Rs`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=pulsepoint-bitstrapped-ai.firebaseapp.com`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID=pulsepoint-bitstrapped-ai`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=pulsepoint-bitstrapped-ai.firebasestorage.app`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=505719121244`
- `NEXT_PUBLIC_FIREBASE_APP_ID=1:505719121244:web:85409d7987746786740d99`
- `NEXT_PUBLIC_ENABLE_SSO=true` (to enable SSO)

## Testing

1. Deploy with SSO enabled
2. Navigate to the app
3. You should see a login screen
4. Click "Sign in with Google"
5. Sign in with your @pulsepoint.com account
6. You should be redirected to the chat interface

## Troubleshooting

### Token Verification Fails
- Check that `FIREBASE_PROJECT_ID` is set correctly in backend
- Verify the token issuer matches `https://securetoken.google.com/pulsepoint-bitstrapped-ai`
- Check backend logs for specific error messages

### Domain Restriction Not Working
- Frontend uses `hd: 'pulsepoint.com'` parameter
- Backend also checks email domain
- Both should prevent non-PulsePoint users

### Service Account Access
If token verification fails with "permission denied", the service account may need:
- `roles/firebase.admin` OR
- `roles/iam.serviceAccountTokenCreator`

