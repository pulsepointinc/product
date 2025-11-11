# Firebase SSO Setup - Quick Start Guide

## ✅ What's Already Done

1. ✅ Firebase config added to frontend (hardcoded with fallback to env vars)
2. ✅ Backend updated to verify Firebase ID tokens
3. ✅ Domain restriction enforced (@pulsepoint.com only)
4. ✅ GitHub Actions workflow updated with Firebase config

## 🔧 What You Need to Do

### Step 1: Grant Service Account Access (If Needed)

The backend service account (`productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com`) should be able to verify Firebase tokens without special permissions, but if you encounter errors, grant it access:

**Option A: Using GCP Console (Recommended)**
1. Go to: https://console.cloud.google.com/iam-admin/iam?project=pulsepoint-bitstrapped-ai
2. Click "Grant Access"
3. Enter: `productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com`
4. Add role: `Firebase Admin` or `Service Account Token Creator`
5. Click "Save"

**Option B: Using gcloud CLI**
```bash
gcloud projects add-iam-policy-binding pulsepoint-bitstrapped-ai \
  --member="serviceAccount:productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com" \
  --role="roles/firebase.admin" \
  --project=pulsepoint-bitstrapped-ai
```

**Note**: The current implementation uses `google-auth` library which verifies tokens using public keys, so this step may not be necessary. Try deploying first and only do this if you see token verification errors.

### Step 2: Deploy with SSO Enabled

The GitHub Actions workflow is already configured with SSO enabled. Just push to main branch:

```bash
git add .
git commit -m "Enable Firebase SSO"
git push origin main
```

Or deploy manually:

**Backend:**
```bash
cd product-gpt-chat/backend
gcloud run deploy product-gpt-chat-api \
  --source . \
  --region us-east4 \
  --project pulsepoint-datahub \
  --allow-unauthenticated \
  --set-env-vars "KNOWLEDGE_LAYER_URL=https://knowledge-layer-v5-420423430685.us-east4.run.app,ENABLE_SSO=true,FIREBASE_PROJECT_ID=pulsepoint-bitstrapped-ai"
```

**Frontend:**
```bash
cd product-gpt-chat/frontend
gcloud run deploy product-gpt-chat \
  --source . \
  --region us-east4 \
  --project pulsepoint-datahub \
  --allow-unauthenticated \
  --set-env-vars "NEXT_PUBLIC_API_URL=https://product-gpt-chat-api-420423430685.us-east4.run.app,NEXT_PUBLIC_ENABLE_SSO=true,NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyB5g8EI16p2waqesbR0JvBymbNBhg5t6Rs,NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=pulsepoint-bitstrapped-ai.firebaseapp.com,NEXT_PUBLIC_FIREBASE_PROJECT_ID=pulsepoint-bitstrapped-ai,NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=pulsepoint-bitstrapped-ai.firebasestorage.app,NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=505719121244,NEXT_PUBLIC_FIREBASE_APP_ID=1:505719121244:web:85409d7987746786740d99"
```

### Step 3: Test

1. Navigate to: https://product-gpt-chat-420423430685.us-east4.run.app
2. You should see a login screen
3. Click "Sign in with Google"
4. Sign in with your @pulsepoint.com account
5. You should be redirected to the chat interface

## 🔍 Troubleshooting

### If token verification fails:
1. Check backend logs: `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=product-gpt-chat-api" --limit 20`
2. Look for "Firebase token verification failed" errors
3. If you see permission errors, grant the service account access (Step 1)

### If domain restriction doesn't work:
- Frontend checks domain on sign-in
- Backend also verifies domain
- Both should prevent non-PulsePoint users

## 📝 Current Status

- ✅ Frontend: Firebase config added, domain restriction enforced
- ✅ Backend: Firebase token verification implemented
- ✅ Deployment: GitHub Actions updated with SSO enabled
- ⏳ **Action Required**: Deploy with SSO enabled (or grant service account access if needed)

## 🚀 Ready to Deploy?

The code is ready! Just deploy using the commands above or push to main branch to trigger GitHub Actions.

