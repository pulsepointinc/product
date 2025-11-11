# Google SSO Setup Guide

## Overview

This application uses Google Identity Platform (Firebase Auth) for **platform access authentication only**. 

**Important**: 
- Google SSO is used to restrict access to the chat platform to PulsePoint employees
- The Knowledge Layer v5 API and other backend APIs are **public** and don't require user authentication
- SSO is only for controlling who can use the chat interface, not for API access

## Cost Information

### Google Identity Platform Pricing

**Free Tier:**
- First 50,000 Monthly Active Users (MAU) per month: **FREE**
- Additional MAU: **$0.015 per user/month**

**For 10-20 users:**
- Cost: **$0/month** (within free tier)
- Even at 100 users: **$0/month** (still within free tier)
- At 1,000 users: **$0/month** (still within free tier)

**Only pay if you exceed 50,000 MAU:**
- 60,000 users: $0.015 × 10,000 = **$150/month**

### Other Costs

- **Cloud Run**: $20-50/month (for hosting)
- **Firestore**: $5-10/month (for conversation history)
- **OpenAI API**: $30-50/month (usage-based)
- **Total**: ~$55-110/month (Identity Platform is FREE for your use case)

## Setup Steps

### 1. Enable Identity Platform in GCP

```bash
# Enable Identity Platform API
gcloud services enable identitytoolkit.googleapis.com --project=pulsepoint-datahub

# Or use Firebase Console
# https://console.firebase.google.com/project/pulsepoint-datahub
```

### 2. Configure OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials/consent?project=pulsepoint-datahub)
2. Configure OAuth consent screen:
   - User Type: **Internal** (for corporate use)
   - App name: "Product GPT Chat"
   - User support email: your email
   - Authorized domains: `pulsepoint.com`
3. Add scopes:
   - `openid`
   - `email`
   - `profile`

### 3. Create OAuth 2.0 Client ID

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials?project=pulsepoint-datahub)
2. Create OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Name: "Product GPT Chat Web"
   - Authorized JavaScript origins:
     - `http://localhost:3000` (for local dev)
     - `https://product-gpt-chat-420423430685.us-east4.run.app` (production)
   - Authorized redirect URIs:
     - `http://localhost:3000/auth/callback` (for local dev)
     - `https://product-gpt-chat-420423430685.us-east4.run.app/auth/callback` (production)

### 4. Configure Firebase Authentication

1. Go to [Firebase Console](https://console.firebase.google.com/project/pulsepoint-datahub/authentication)
2. Enable **Google** sign-in method
3. Add authorized domains:
   - `pulsepoint.com`
   - Your Cloud Run domain

### 5. Set Environment Variables

**Backend (Cloud Run):**
```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
KNOWLEDGE_LAYER_URL=https://knowledge-layer-v5-420423430685.us-east4.run.app
```

**Frontend (Environment variables):**
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=pulsepoint-datahub.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=pulsepoint-datahub
NEXT_PUBLIC_API_URL=https://product-gpt-chat-api-420423430685.us-east4.run.app
```

### 6. Store Secrets in Secret Manager

```bash
# Store OAuth credentials
echo -n "your-client-id" | gcloud secrets create google-client-id \
  --data-file=- --project=pulsepoint-datahub

echo -n "your-client-secret" | gcloud secrets create google-client-secret \
  --data-file=- --project=pulsepoint-datahub
```

## Authentication Flow

### Platform Access (Google SSO)
1. **User visits chat app** → Must sign in with Google
2. **Frontend**: Firebase Auth configured with `hd: 'pulsepoint.com'` parameter
3. **Backend**: Token verification checks email domain (must be @pulsepoint.com)
4. **Result**: Only PulsePoint employees can access the chat platform

### API Access (No User Auth Required)
1. **Backend calls Knowledge Layer v5** → Public API, no authentication needed
2. **Knowledge Layer v5 calls**:
   - Confluence API (public)
   - Jira API (public)
   - GitHub API (public)
   - Document360 API (public)
3. **Result**: APIs are accessible without user credentials

## Domain Restriction

The application restricts **platform access** to `@pulsepoint.com` email addresses:

1. **Frontend**: Firebase Auth configured with `hd: 'pulsepoint.com'` parameter
2. **Backend**: Token verification checks email domain before allowing platform access
3. **APIs**: Remain public and don't require user authentication

## Testing

### Local Development

1. Set up Firebase project
2. Configure OAuth client with `http://localhost:3000` as authorized origin
3. Run frontend: `npm run dev`
4. Run backend: `uvicorn app.main:app --reload`
5. Test sign-in flow

### Production

1. Deploy to Cloud Run
2. Update OAuth client with production URLs
3. Test with corporate email

## Security Considerations

1. **Domain Restriction**: Only `@pulsepoint.com` emails allowed
2. **Token Verification**: Backend verifies all tokens with Google
3. **HTTPS Only**: All production traffic over HTTPS
4. **CORS**: Configured for specific origins only

## Troubleshooting

### "Access denied" error
- Check email domain is `@pulsepoint.com`
- Verify OAuth consent screen is configured
- Check authorized domains in Firebase

### Token verification fails
- Verify `GOOGLE_CLIENT_ID` matches OAuth client ID
- Check token hasn't expired
- Ensure backend can reach Google's token verification endpoint

## References

- [Google Identity Platform Pricing](https://cloud.google.com/identity-platform/pricing)
- [Firebase Auth Documentation](https://firebase.google.com/docs/auth)
- [OAuth 2.0 Setup](https://developers.google.com/identity/protocols/oauth2)

