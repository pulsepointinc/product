"""
Product GPT Chat - Backend API
FastAPI application with Google SSO authentication
"""

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import requests
import os
from typing import Optional, List
import logging
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Product GPT Chat API",
    description="Backend API for Product GPT Chat application",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure based on frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer(auto_error=False)

# Configuration
KNOWLEDGE_LAYER_URL = os.getenv(
    "KNOWLEDGE_LAYER_URL",
    "https://us-east4-pulsepoint-datahub.cloudfunctions.net/knowledge-layer-v5"
)

# Firebase configuration for SSO
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "pulsepoint-bitstrapped-ai")
ALLOWED_DOMAINS = ["pulsepoint.com"]  # Only allow corporate emails
ENABLE_SSO = os.getenv("ENABLE_SSO", "false").lower() == "true"  # SSO disabled by default


async def verify_firebase_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Verify Firebase ID token for platform access (not API access)
    
    If SSO is disabled (ENABLE_SSO=false), returns a mock user.
    If SSO is enabled, verifies the Firebase ID token.
    
    The Knowledge Layer v5 API and other backend APIs are public and don't require user auth.
    """
    # If SSO is disabled, return mock user
    if not ENABLE_SSO:
        return {
            "email": "user@example.com",
            "name": "User",
            "picture": "",
            "user_id": "anonymous"
        }
    
    # SSO is enabled - verify Firebase ID token
    token = credentials.credentials
    
    try:
        # Verify Firebase ID token
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
        import cachecontrol
        import requests
        
        # Create a new requests session with cache control to prevent certificate caching issues
        # This fixes the "Certificate for key id ... not found" error
        session = requests.Session()
        cached_session = cachecontrol.CacheControl(session)
        http_request = google_requests.Request(session=cached_session)
        
        # Firebase ID tokens are verified using verify_oauth2_token
        # The audience should be the Firebase project ID
        # Firebase tokens are issued by: https://securetoken.google.com/{project-id}
        idinfo = id_token.verify_oauth2_token(
            token, 
            http_request,
            audience=FIREBASE_PROJECT_ID
        )
        
        # Verify the issuer is Firebase
        issuer = idinfo.get('iss', '')
        expected_issuer = f'https://securetoken.google.com/{FIREBASE_PROJECT_ID}'
        if issuer != expected_issuer:
            raise ValueError(f"Invalid token issuer: {issuer}")
        
        # Extract and validate email domain
        email = idinfo.get('email', '')
        domain = email.split('@')[1] if '@' in email else ''
        
        # Restrict access to PulsePoint corporate emails only
        if domain not in ALLOWED_DOMAINS:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Only {', '.join(ALLOWED_DOMAINS)} email addresses are allowed."
            )
        
        # Return user info for session tracking
        return {
            "email": email,
            "name": idinfo.get('name', ''),
            "picture": idinfo.get('picture', ''),
            "user_id": idinfo.get('sub', '')
        }
    except ValueError as e:
        # Invalid token
        logger.error(f"Firebase token verification failed: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token"
        )
    except Exception as e:
        logger.error(f"Unexpected error during Firebase token verification: {e}")
        raise HTTPException(
            status_code=500,
            detail="Authentication service error"
        )


async def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Return authenticated user if SSO enabled, else None"""
    if not ENABLE_SSO or not credentials:
        return None
    return await verify_firebase_token(credentials)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Product GPT Chat API",
        "version": "1.0.0"
    }


@app.get("/api/health")
async def health():
    """Detailed health check"""
    return {
        "status": "healthy",
        "knowledge_layer_url": KNOWLEDGE_LAYER_URL,
        "authentication": "Google SSO"
    }


class ConversationMessage(BaseModel):
    role: Optional[str] = None
    content: Optional[str] = None


class AskRequest(BaseModel):
    question: str
    session_id: Optional[str] = None
    conversation_history: List[ConversationMessage] = []
    max_results: Optional[int] = 50
    model_preference: Optional[str] = None  # 'gpt-4o-mini', 'gpt-4o', 'gemini-2.0-flash-001', or None for auto


@app.post("/api/chat/ask")
async def ask_question(
    payload: AskRequest,
    user: dict = Depends(get_optional_user)
):
    """
    Forward question to Knowledge Layer v5 API
    
    Requires Google SSO authentication to access the chat platform.
    The Knowledge Layer v5 API itself is public and doesn't require user authentication.
    
    This endpoint:
    1. Verifies user is authenticated via Google SSO (platform access)
    2. Forwards request to Knowledge Layer v5 (public API)
    3. Returns response with user context for logging/tracking
    """
    question = payload.question
    if not question or not question.strip():
        raise HTTPException(status_code=400, detail="Question is required")

    # Get user info (or use anonymous if SSO disabled)
    user_info = user if user else {"email": "anonymous@example.com", "name": "Anonymous"}
    logger.info(f"Question from {user_info.get('email', 'anonymous')}: {question}")

    # Prepare request for Knowledge Layer v5 (public API, no auth needed)
    knowledge_layer_request = payload.model_dump(exclude_none=True)
    try:
        # Forward to Knowledge Layer v5 (public endpoint, no authentication required)
        # Increased timeout to 120 seconds for complex queries
        response = requests.post(
            f"{KNOWLEDGE_LAYER_URL}/ask",
            json=knowledge_layer_request,
            timeout=120
        )
        
        if response.status_code != 200:
            logger.error(f"Knowledge Layer API error: {response.status_code}")
            raise HTTPException(
                status_code=response.status_code,
                detail="Knowledge Layer API error"
            )
        
        result = response.json()
        
        # Ensure consistent response format for frontend
        # Frontend expects synthesis_response.response or response
        if "synthesis_response" not in result and "response" in result:
            # Knowledge layer returned response at top level, wrap it
            result = {
                "synthesis_response": {
                    "response": result.get("response", ""),
                    "sources": result.get("sources", []),
                    "synthesis_method": result.get("synthesis_method", "unknown"),
                    "model_used": result.get("synthesis_method", "unknown").replace("openai_", "").replace("gemini_", ""),
                    "provider": "openai" if "openai" in result.get("synthesis_method", "") else "gemini" if "gemini" in result.get("synthesis_method", "") else "unknown"
                },
                **{k: v for k, v in result.items() if k not in ["response", "sources", "synthesis_method"]}
            }
        
        # Add user context for logging/tracking (not sent to Knowledge Layer API)
        result["user_email"] = user_info.get("email", "anonymous")
        result["user_name"] = user_info.get("name", "Anonymous")
        
        return result
        
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Request timeout")
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/chat/history")
async def get_history(
    session_id: str,
    user: dict = Depends(get_optional_user)
):
    """
    Get conversation history for a session
    
    TODO: Implement Firestore integration
    """
    # TODO: Query Firestore for conversation history
    return {
        "session_id": session_id,
        "messages": [],
        "message": "History feature coming soon"
    }


@app.post("/api/chat/export")
async def export_conversation(
    request: dict,
    user: dict = Depends(get_optional_user)
):
    """
    Export conversation as PDF or markdown
    
    TODO: Implement export functionality
    """
    session_id = request.get("session_id")
    format_type = request.get("format", "markdown")
    
    # TODO: Implement export
    return {
        "message": "Export feature coming soon",
        "session_id": session_id,
        "format": format_type
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)

