# Firebase SAML Authentication Setup Guide

## Overview
This guide explains how to configure Firebase Authentication to use SAML (Security Assertion Markup Language) to bypass Fortinet interception and integrate with your corporate SSO provider.

## Prerequisites
1. Firebase project: `pulsepoint-bitstrapped-ai`
2. Firebase Identity Platform enabled (required for SAML)
3. Access to your corporate SAML IdP (Fortinet/FortiAuth) configuration

## Step 1: Enable Firebase Identity Platform

1. Go to [Firebase Console](https://console.firebase.google.com/u/0/project/pulsepoint-bitstrapped-ai)
2. Navigate to **Authentication** → **Settings** → **Advanced**
3. If Identity Platform is not enabled, click **Upgrade** to enable it
4. Note: This may incur additional costs. Check pricing at: https://firebase.google.com/pricing

## Step 2: Collect SAML Identity Provider (IdP) Information

You'll need the following information from your IT department or Fortinet administrator:

1. **Entity ID**: Unique identifier for your IdP (e.g., `https://fortiauth.internetbrands.com/saml-idp/ftyfz28cc0rq0jyk`)
2. **SSO URL**: The SAML sign-in endpoint (e.g., `https://fortiauth.internetbrands.com/saml-idp/ftyfz28cc0rq0jyk/login/`)
3. **Public Certificate**: X.509 certificate used to verify SAML responses (usually in PEM format)
4. **Service Provider Entity ID**: Will be provided by Firebase (format: `https://pulsepoint-bitstrapped-ai.firebaseapp.com`)

## Step 3: Configure SAML Provider in Firebase Console

1. Go to [Firebase Console → Authentication → Sign-in method](https://console.firebase.google.com/u/0/project/pulsepoint-bitstrapped-ai/authentication/providers)
2. Click **Add new provider**
3. Select **SAML** from the list
4. Fill in the following:
   - **Provider ID**: Choose a unique ID (e.g., `pulsepoint-saml`)
   - **Display name**: "PulsePoint SSO" (optional)
   - **Entity ID**: Your IdP's Entity ID
   - **SSO URL**: Your IdP's SSO URL
   - **Public certificate**: Paste the X.509 certificate (PEM format)
5. Click **Save**
6. **Important**: Copy the **Service Provider Entity ID** and **ACS URL** - you'll need these for Step 4

## Step 4: Configure Your SAML IdP (Fortinet/FortiAuth)

Provide the following information to your IT/Fortinet administrator:

1. **Service Provider Entity ID**: `https://pulsepoint-bitstrapped-ai.firebaseapp.com`
2. **ACS (Assertion Consumer Service) URL**: `https://pulsepoint-bitstrapped-ai.firebaseapp.com/__/auth/handler`
3. **Name ID Format**: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` (or email)
4. **Attribute Mapping**:
   - Email: Map to `email` or `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`
   - Name: Map to `name` or `displayName` (optional)

## Step 5: Update Application Code

The code has already been updated to support SAML. You just need to set the environment variable:

### For Frontend Deployment:

Add this to your Cloud Build substitutions:
```bash
_NEXT_PUBLIC_SAML_PROVIDER_ID=saml.pulsepoint-saml
```

Replace `pulsepoint-saml` with the Provider ID you chose in Step 3.

### Update cloudbuild.yaml:

Add this line to the environment variables section:
```yaml
- 'NEXT_PUBLIC_SAML_PROVIDER_ID=${_NEXT_PUBLIC_SAML_PROVIDER_ID}'
```

## Step 6: Test the Configuration

1. Deploy the updated frontend with `NEXT_PUBLIC_SAML_PROVIDER_ID` set
2. Navigate to the application
3. Click "Sign in"
4. You should be redirected to Fortinet/FortiAuth login (not Google)
5. After successful login, you should be redirected back to the application

## Troubleshooting

### SAML Provider Not Found
- Verify `NEXT_PUBLIC_SAML_PROVIDER_ID` is set correctly
- Format should be: `saml.PROVIDER_ID` (e.g., `saml.pulsepoint-saml`)
- Check Firebase Console to confirm the Provider ID

### Authentication Fails
- Check Firebase Console → Authentication → Sign-in method → SAML → View logs
- Verify the SAML response is being received
- Check that email attribute is mapped correctly
- Ensure the certificate is valid and matches your IdP

### Still Seeing Google OAuth
- Verify `NEXT_PUBLIC_SAML_PROVIDER_ID` is set in the deployed environment
- Check browser console for SAML provider initialization logs
- Hard refresh the page (Cmd+Shift+R) to clear cache

## Fallback Behavior

If SAML is not configured or fails, the application will automatically fall back to Google OAuth authentication. This ensures the application continues to work even if SAML configuration is incomplete.

## Support

If you encounter issues:
1. Check Firebase Console → Authentication → Sign-in method → SAML for error messages
2. Review browser console logs for detailed error information
3. Contact your IT department to verify SAML IdP configuration
4. Verify Firebase Identity Platform is enabled

