# Pre-Deployment Checklist

## ✅ Completed

- [x] GitHub secret `GCP_SA_KEY` added
- [x] Service account configured
- [x] Project structure created
- [x] Code files ready

## ⚠️ Still Needed (Before First Deployment)

### 1. Google OAuth Secrets (For SSO)

The application needs Google OAuth credentials for SSO. These need to be created and stored in Secret Manager:

**Required Secrets:**
- `google-client-id` - OAuth 2.0 Client ID
- `google-client-secret` - OAuth 2.0 Client Secret

**Setup Steps:**
1. Go to [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials?project=pulsepoint-datahub)
2. Create OAuth 2.0 Client ID (Web application)
3. Store in Secret Manager:
   ```bash
   echo -n "your-client-id" | gcloud secrets create google-client-id \
     --data-file=- --project=pulsepoint-datahub
   
   echo -n "your-client-secret" | gcloud secrets create google-client-secret \
     --data-file=- --project=pulsepoint-datahub
   ```

**Note**: You can deploy without these first, but SSO won't work. The app will show authentication errors.

### 2. Firebase Configuration (For Frontend)

The frontend needs Firebase configuration. Create a `.env.local` file or set environment variables:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=pulsepoint-datahub.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=pulsepoint-datahub
```

**Or** set these as Cloud Run environment variables during deployment.

### 3. Push to GitHub

Once code is pushed to `pulsepointinc/product`, GitHub Actions will automatically deploy.

## Deployment Options

### Option 1: Deploy Now (SSO will need setup later)
- Push code to GitHub
- Deploy backend and frontend
- Set up Google OAuth later
- Users won't be able to sign in until OAuth is configured

### Option 2: Set Up OAuth First (Recommended)
- Create OAuth credentials
- Store in Secret Manager
- Push code to GitHub
- Full functionality from day one

## Quick Start (Minimal Setup)

If you want to deploy now and set up SSO later:

1. **Push code to GitHub** (we can do this now)
2. **Deploy** (GitHub Actions will run automatically)
3. **Set up OAuth later** (when ready to enable SSO)

The app will deploy but show authentication errors until OAuth is configured.

## Next Steps

1. **Decide**: Deploy now or set up OAuth first?
2. **If deploy now**: Push code to GitHub
3. **If OAuth first**: Follow `GOOGLE_SSO_SETUP.md` guide

