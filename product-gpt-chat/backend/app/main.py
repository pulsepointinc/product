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
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore

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

# Initialize Firestore for usage tracking
db = None
def get_firestore_db():
    global db
    if db is None:
        try:
            # Initialize Firebase Admin if not already initialized
            try:
                firebase_admin.get_app()
            except ValueError:
                firebase_admin.initialize_app(options={'projectId': FIREBASE_PROJECT_ID})
            db = firestore.client()
        except Exception as e:
            logger.error(f"Failed to initialize Firestore: {e}")
            db = None
    return db


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
        # Verify Firebase ID token using Firebase Admin SDK (more reliable than google-auth)
        # This avoids certificate caching issues
        import firebase_admin
        from firebase_admin import auth
        
        # Initialize Firebase Admin if not already initialized
        try:
            firebase_admin.get_app()
        except ValueError:
            # Initialize with project ID (no credentials needed for token verification)
            firebase_admin.initialize_app(options={'projectId': FIREBASE_PROJECT_ID})
        
        # Verify the ID token using Firebase Admin SDK
        # This handles certificate fetching and caching properly
        decoded_token = auth.verify_id_token(token)
        
        # Extract user info from decoded token
        idinfo = decoded_token
        
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


def check_user_has_access(email: str) -> bool:
    """
    Check if user has access to the platform via Firestore user_permissions
    Always allows bweinstein@pulsepoint.com as fallback admin
    """
    # Always allow bweinstein@pulsepoint.com (fallback admin)
    if email and (email == 'bweinstein@pulsepoint.com' or email.lower() == 'bweinstein@pulsepoint.com'):
        return True
    
    if not ENABLE_SSO:
        return True  # If SSO is disabled, allow access
    
    firestore_db = get_firestore_db()
    if not firestore_db:
        logger.warning("Firestore not available, denying access for security")
        return False
    
    try:
        # Check if user has an active permission record
        users_ref = firestore_db.collection('user_permissions')
        query = users_ref.where('email', '==', email.lower()).limit(1)
        docs = query.stream()
        
        for doc in docs:
            doc_data = doc.to_dict()
            if doc_data.get('isActive', False):
                return True
        
        # No active permission found
        logger.info(f"Access denied for {email}: No active permission record found")
        return False
    except Exception as e:
        logger.error(f"Error checking user access: {e}")
        # On error, deny access for security
        return False


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
    2. Checks if user has permission to access the platform
    3. Forwards request to Knowledge Layer v5 (public API)
    4. Returns response with user context for logging/tracking
    """
    question = payload.question
    if not question or not question.strip():
        raise HTTPException(status_code=400, detail="Question is required")

    # Get user info (or use anonymous if SSO disabled)
    user_info = user if user else {"email": "anonymous@example.com", "name": "Anonymous"}
    user_email = user_info.get('email', '')
    
    # Check user access (only if SSO is enabled)
    if ENABLE_SSO and user_email and user_email != "anonymous@example.com":
        if not check_user_has_access(user_email):
            logger.warning(f"Access denied for {user_email}: No permission record found")
            raise HTTPException(
                status_code=403,
                detail="Access denied. You don't have permission to use this platform. Please contact an administrator."
            )
    
    logger.info(f"Question from {user_email}: {question}")

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
        
        # Track usage in Firestore
        try:
            synthesis_response = result.get("synthesis_response", {})
            token_usage = synthesis_response.get("token_usage", {})
            model_used = synthesis_response.get("model_used", "unknown")
            provider = synthesis_response.get("provider", "unknown")
            
            # Calculate cost from token usage
            input_tokens = token_usage.get("input_tokens", 0)
            output_tokens = token_usage.get("output_tokens", 0)
            
            # Calculate cost based on model
            cost = 0.0
            if provider == "openai":
                if model_used == "gpt-4o-mini":
                    cost = (input_tokens * 0.15 + output_tokens * 0.60) / 1_000_000
                elif model_used == "gpt-4o":
                    cost = (input_tokens * 2.50 + output_tokens * 10.00) / 1_000_000
                else:
                    cost = (input_tokens * 2.50 + output_tokens * 10.00) / 1_000_000
            elif provider == "gemini":
                # Gemini 2.0 Flash: $0.075 per 1M input tokens, $0.30 per 1M output tokens
                cost = (input_tokens * 0.075 + output_tokens * 0.30) / 1_000_000
            
            # Record usage in Firestore
            if ENABLE_SSO and user_info.get("email") and user_info.get("user_id"):
                firestore_db = get_firestore_db()
                if firestore_db:
                    usage_record = {
                        "userId": user_info.get("user_id"),
                        "email": user_info.get("email").lower(),
                        "model": model_used,
                        "inputTokens": input_tokens,
                        "outputTokens": output_tokens,
                        "cost": cost,
                        "conversationId": payload.session_id,
                        "timestamp": firestore.SERVER_TIMESTAMP
                    }
                    firestore_db.collection("usage_tracking").add(usage_record)
                    logger.info(f"Recorded usage: {user_info.get('email')} - {model_used} - ${cost:.6f}")
        except Exception as e:
            logger.error(f"Failed to record usage: {e}")
            # Don't fail the request if usage tracking fails
        
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

