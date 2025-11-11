# Deployment Notes

## Current Status

✅ **GitHub Secret Added**: `GCP_SA_KEY` is configured
✅ **Code Ready**: All files are in place
⚠️ **OAuth Not Configured**: SSO will need setup (can deploy without it)

## What Happens When You Push

1. **GitHub Actions triggers** automatically
2. **Backend deploys** to Cloud Run (`product-gpt-chat-api`)
3. **Frontend deploys** to Cloud Run (`product-gpt-chat`)
4. **SSO won't work** until OAuth credentials are added

## OAuth Setup (Can Do Later)

The app will deploy successfully, but users won't be able to sign in until you:

1. Create OAuth 2.0 Client ID in Google Cloud Console
2. Store credentials in Secret Manager:
   - `google-client-id`
   - `google-client-secret`

See `GOOGLE_SSO_SETUP.md` for detailed instructions.

## After Push

Once code is pushed, you can:
- Monitor deployment in GitHub Actions tab
- Check Cloud Run services
- Set up OAuth when ready

The app will be accessible but show authentication errors until OAuth is configured.

