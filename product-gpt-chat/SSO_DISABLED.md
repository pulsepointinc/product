# SSO Disabled - Initial Deployment

## Current Status

✅ **SSO is DISABLED** for initial deployment
✅ **App works without authentication** - anyone can use it
✅ **Can be enabled later** by setting environment variables

## How It Works

### Backend
- `ENABLE_SSO=false` (default)
- No authentication required
- Returns anonymous user info
- All API endpoints accessible

### Frontend
- `NEXT_PUBLIC_ENABLE_SSO=false` (default)
- No login screen
- Direct access to chat interface
- No authentication checks

## Enabling SSO Later

When you're ready to enable SSO:

### 1. Create OAuth Credentials
Follow `GOOGLE_SSO_SETUP.md` to create OAuth 2.0 credentials

### 2. Store in Secret Manager
```bash
echo -n "your-client-id" | gcloud secrets create google-client-id \
  --data-file=- --project=pulsepoint-datahub

echo -n "your-client-secret" | gcloud secrets create google-client-secret \
  --data-file=- --project=pulsepoint-datahub
```

### 3. Update Environment Variables

**Backend:**
```bash
gcloud run services update product-gpt-chat-api \
  --region us-east4 \
  --set-env-vars "ENABLE_SSO=true" \
  --set-secrets "GOOGLE_CLIENT_ID=google-client-id:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest"
```

**Frontend:**
```bash
gcloud run services update product-gpt-chat \
  --region us-east4 \
  --set-env-vars "NEXT_PUBLIC_ENABLE_SSO=true"
```

### 4. Redeploy
The app will automatically require Google SSO authentication.

## Current Deployment

The app is deployed **without SSO** and is accessible to anyone. This allows you to:
- Test the application immediately
- Set up OAuth credentials at your convenience
- Enable SSO when ready

## Security Note

⚠️ **Without SSO, the app is publicly accessible.** Anyone with the URL can use it.

For production use, enable SSO to restrict access to `@pulsepoint.com` email addresses.

