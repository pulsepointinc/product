# Product GPT Chat - Architecture Overview

## Authentication Model

### Platform Access (Google SSO)
- **Purpose**: Control who can access the chat application
- **Method**: Google Identity Platform (Firebase Auth)
- **Restriction**: Only `@pulsepoint.com` email addresses
- **Location**: Frontend + Backend API gateway

### API Access (Public)
- **Purpose**: Access to Knowledge Layer and data sources
- **Method**: No authentication required (public APIs)
- **APIs**:
  - Knowledge Layer v5: Public endpoint
  - Confluence API: Public endpoint
  - Jira API: Public endpoint
  - GitHub API: Public endpoint
  - Document360 API: Public endpoint

## Request Flow

```
┌─────────────────────────────────────────────────────────┐
│                    User Browser                         │
│  1. User must sign in with Google (@pulsepoint.com)    │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ HTTPS (with Google Auth token)
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Frontend (Next.js)                         │
│  - Validates Google SSO token                          │
│  - Shows chat interface                                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ API Request (includes Google token)
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Backend API (FastAPI)                           │
│  1. Verifies Google SSO token                           │
│  2. Checks email domain (@pulsepoint.com)             │
│  3. If valid, forwards to Knowledge Layer               │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ HTTP POST (NO authentication)
                     ▼
┌─────────────────────────────────────────────────────────┐
│      Knowledge Layer v5 API (Public)                    │
│  - No user authentication required                       │
│  - Processes question                                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Calls (all public, no auth)
                     ├─► Confluence API
                     ├─► Jira API
                     ├─► GitHub API
                     └─► Document360 API
```

## Key Points

1. **Google SSO is for platform access only**
   - Users must authenticate to use the chat app
   - Prevents unauthorized access to the interface

2. **APIs are public**
   - Knowledge Layer v5 is a public endpoint
   - All data source APIs are public
   - No user credentials needed for API calls

3. **User context is tracked for logging**
   - Backend logs which user asked which question
   - User email added to response for analytics
   - Not used for API authentication

## Security Model

### What Google SSO Protects
- ✅ Access to the chat application
- ✅ User session management
- ✅ Conversation history (per user)
- ✅ Analytics and logging

### What Google SSO Does NOT Protect
- ❌ Knowledge Layer v5 API (public)
- ❌ Confluence API (public)
- ❌ Jira API (public)
- ❌ Other data source APIs (public)

### Why This Model?

1. **Simpler Architecture**: APIs don't need user authentication
2. **Better Performance**: No token passing through API chain
3. **Easier Maintenance**: APIs remain independent
4. **Platform Control**: SSO only controls who can use the chat app

## Implementation Details

### Frontend Authentication
- Uses Firebase Auth with Google provider
- Restricts to `pulsepoint.com` domain
- Stores auth token in browser
- Sends token in Authorization header to backend

### Backend Token Verification
- Verifies Google OAuth token on each request
- Checks email domain matches `@pulsepoint.com`
- Returns 403 if domain doesn't match
- Forwards request to Knowledge Layer (no auth)

### API Calls
- Backend makes unauthenticated calls to Knowledge Layer
- Knowledge Layer makes unauthenticated calls to data sources
- All APIs are public endpoints

## Cost Implications

- **Google Identity Platform**: FREE for < 50,000 users
- **No additional API auth costs**: APIs are public
- **Total SSO cost**: $0/month for your use case

