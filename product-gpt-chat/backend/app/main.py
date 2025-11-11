"""
Product GPT Chat - Backend API
FastAPI application with Google SSO authentication
"""

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import requests
import os
from typing import Optional
import logging

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
security = HTTPBearer()

# Configuration
KNOWLEDGE_LAYER_URL = os.getenv(
    "KNOWLEDGE_LAYER_URL",
    "https://knowledge-layer-v5-420423430685.us-east4.run.app"
)

# Google OAuth configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
ALLOWED_DOMAINS = ["pulsepoint.com"]  # Only allow corporate emails


async def verify_google_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Verify Google OAuth token for platform access (not API access)
    
    This verifies that the user is authenticated via Google SSO to access the chat platform.
    The Knowledge Layer v5 API and other backend APIs are public and don't require user auth.
    
    Steps:
    1. Verify the token with Google
    2. Extract user email
    3. Check if email domain is in ALLOWED_DOMAINS (pulsepoint.com)
    4. Return user info for session tracking
    """
    token = credentials.credentials
    
    try:
        # Verify token with Google Identity Platform
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
        
        # Verify the OAuth2 token
        idinfo = id_token.verify_oauth2_token(
            token, 
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )
        
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
        logger.error(f"Token verification failed: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token"
        )
    except Exception as e:
        logger.error(f"Unexpected error during token verification: {e}")
        raise HTTPException(
            status_code=500,
            detail="Authentication service error"
        )


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


@app.post("/api/chat/ask")
async def ask_question(
    request: dict,
    user: dict = Depends(verify_google_token)
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
    question = request.get("question")
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    
    logger.info(f"Question from {user['email']}: {question}")
    
    # Prepare request for Knowledge Layer v5 (public API, no auth needed)
    knowledge_layer_request = {
        "question": question,
        "session_id": request.get("session_id"),
        "conversation_history": request.get("conversation_history", []),
        "max_results": request.get("max_results", 50)
    }
    
    try:
        # Forward to Knowledge Layer v5 (public endpoint, no authentication required)
        response = requests.post(
            f"{KNOWLEDGE_LAYER_URL}/ask",
            json=knowledge_layer_request,
            timeout=60
        )
        
        if response.status_code != 200:
            logger.error(f"Knowledge Layer API error: {response.status_code}")
            raise HTTPException(
                status_code=response.status_code,
                detail="Knowledge Layer API error"
            )
        
        result = response.json()
        
        # Add user context for logging/tracking (not sent to Knowledge Layer API)
        result["user_email"] = user["email"]
        result["user_name"] = user.get("name", "")
        
        return result
        
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Request timeout")
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/chat/history")
async def get_history(
    session_id: str,
    user: dict = Depends(verify_google_token)
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
    user: dict = Depends(verify_google_token)
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

