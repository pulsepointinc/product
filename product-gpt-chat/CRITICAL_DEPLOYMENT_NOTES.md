# Critical Deployment Notes - Product GPT Chat

## ⚠️ CRITICAL: Never Change These Without Testing

### 1. Frontend Deployment - Build-Time Environment Variables

**CRITICAL RULE**: Next.js `NEXT_PUBLIC_*` environment variables MUST be set at BUILD TIME, not runtime.

**✅ CORRECT Deployment Method:**
```bash
cd product-gpt-chat/frontend
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_NEXT_PUBLIC_API_URL=https://product-gpt-chat-api-kpwy2mbv7a-uk.a.run.app,\
_NEXT_PUBLIC_ENABLE_SSO=true,\
_NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyB5g8EI16p2waqesbR0JvBymbNBhg5t6Rs,\
_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=pulsepoint-bitstrapped-ai.firebaseapp.com,\
_NEXT_PUBLIC_FIREBASE_PROJECT_ID=pulsepoint-bitstrapped-ai,\
_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=pulsepoint-bitstrapped-ai.firebasestorage.app,\
_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=505719121244,\
_NEXT_PUBLIC_FIREBASE_APP_ID=1:505719121244:web:85409d7987746786740d99,\
_NEXT_PUBLIC_SAML_PROVIDER_ID=saml.pulsepoint,\
_IMAGE_TAG=latest \
  --project=pulsepoint-datahub
```

**❌ WRONG**: Using `gcloud builds submit` directly without `cloudbuild.yaml` - this won't pass build args!

**Why**: Next.js bakes `NEXT_PUBLIC_*` variables into the JavaScript bundle at build time. Setting them at runtime (via Cloud Run env vars) has NO effect.

### 2. Backend API URL Configuration

**CRITICAL**: Always use the correct backend URL in frontend configuration.

**Current Backend URL**: `https://product-gpt-chat-api-kpwy2mbv7a-uk.a.run.app`

**Frontend Fallback URL** (in `app/page.tsx`):
```typescript
const apiUrl = process.env.NEXT_PUBLIC_API_URL 
  || 'https://product-gpt-chat-api-kpwy2mbv7a-uk.a.run.app';
```

**⚠️ NEVER use**: `https://product-gpt-chat-backend-420423430685.us-east4.run.app` (this is wrong!)

### 3. CORS Configuration in Backend

**CRITICAL**: Backend MUST allow the frontend origin in CORS configuration.

**Current CORS Config** (in `backend/app/main.py`):
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "https://product-gpt-chat-420423430685.us-east4.run.app",
        "https://product-gpt-chat-kpwy2mbv7a-uk.a.run.app",
        "https://product-gpt-chat-backend-420423430685.us-east4.run.app",  # Alternative frontend URL
        "http://localhost:3000",  # For local development
        "http://localhost:8080",   # For local development
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)
```

**⚠️ IMPORTANT**: 
- When `allow_credentials=True`, you CANNOT use `allow_origins=["*"]`
- Must explicitly list all allowed origins
- Frontend origin MUST be in the list or CORS will fail

### 4. React Hooks Rules - Authentication

**CRITICAL**: `useEffect` hooks MUST always return a cleanup function, even when conditionally executed.

**✅ CORRECT Pattern**:
```typescript
useEffect(() => {
  let isMounted = true;
  let unsubscribe: (() => void) | null = null;
  
  if (!SSO_ENABLED) {
    setLoading(false);
  } else {
    // Load Firebase if SSO is enabled
    loadFirebase().then(() => {
      // ... initialization code
      unsubscribe = onAuthStateChanged(auth, (user) => {
        // ... handler
      });
    });
  }
  
  // ALWAYS return cleanup function
  return () => {
    isMounted = false;
    if (unsubscribe) {
      unsubscribe();
    }
  };
}, [SSO_ENABLED]);
```

**❌ WRONG**: Early return without cleanup function:
```typescript
useEffect(() => {
  if (!SSO_ENABLED) {
    setLoading(false);
    return; // ❌ This violates React Hooks rules!
  }
  // ... rest of code
}, [SSO_ENABLED]);
```

### 5. User Message Styling

**CRITICAL**: User messages must use purple background with white text for visibility.

**Current Styling** (in `components/ChatMessage.tsx`):
```typescript
// User messages: always purple background with white text for visibility
const userBg = darkMode ? 'bg-purple-700' : 'bg-purple-600';

// In JSX:
<div className={`${userBg} text-white`} 
     style={isUser ? { backgroundColor: darkMode ? '#7C3AED' : '#9333EA' } : {}}>
```

**⚠️ NEVER use**: Light blue or light colors for user messages - text becomes unreadable!

### 6. Model Preference Handling

**CRITICAL**: Model preference is sent in request body as `model_preference`.

**Frontend** (in `app/page.tsx`):
```typescript
body: JSON.stringify({
  question,
  session_id: currentConversationId || `session_${Date.now()}`,
  conversation_history: messages.slice(-5).map(m => ({
    role: m.role,
    content: m.content
  })),
  max_results: 50,
  model_preference: modelPreference !== 'auto' ? modelPreference : undefined
}),
```

**Backend** (in `backend/app/main.py`):
```python
class AskRequest(BaseModel):
    question: str
    session_id: Optional[str] = None
    conversation_history: List[ConversationMessage] = []
    max_results: Optional[int] = 50
    model_preference: Optional[str] = None  # 'gpt-4o-mini', 'gpt-4o', 'gemini-2.0-flash-001', or None for auto
```

**⚠️ IMPORTANT**: 
- Frontend sends `model_preference` (snake_case)
- Backend expects `model_preference` (snake_case)
- If `modelPreference === 'auto'`, send `undefined` (not the string "auto")

## Service URLs Reference

### Frontend
- **Production**: `https://product-gpt-chat-kpwy2mbv7a-uk.a.run.app`
- **Alternative**: `https://product-gpt-chat-420423430685.us-east4.run.app`

### Backend API
- **Production**: `https://product-gpt-chat-api-kpwy2mbv7a-uk.a.run.app`
- **⚠️ WRONG (don't use)**: `https://product-gpt-chat-backend-420423430685.us-east4.run.app`

## Common Mistakes to Avoid

1. ❌ **Setting `NEXT_PUBLIC_*` env vars at runtime** - They must be set at build time via `cloudbuild.yaml`
2. ❌ **Using wrong backend URL** - Always use `product-gpt-chat-api-kpwy2mbv7a-uk.a.run.app`
3. ❌ **CORS with `allow_origins=["*"]` and `allow_credentials=True`** - This is invalid, must list origins explicitly
4. ❌ **Early return in `useEffect` without cleanup** - Always return cleanup function
5. ❌ **Light colors for user messages** - Must use purple background with white text
6. ❌ **Deploying backend under personal username** - Always use "Cloud Run Functions" (Rule 3)

## Testing Checklist

Before deploying, verify:
- [ ] Frontend uses `cloudbuild.yaml` with all `NEXT_PUBLIC_*` substitutions
- [ ] Backend CORS includes frontend origin
- [ ] Backend URL in frontend matches actual backend service URL
- [ ] No early returns in `useEffect` hooks
- [ ] User messages have purple background with white text
- [ ] Model preference is sent correctly in request body

## Last Updated
November 19, 2025 - After fixing CORS, model selection, and user message styling issues

