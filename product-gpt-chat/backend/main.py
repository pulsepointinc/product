"""
Cloud Function gen2 entry point for Product GPT Chat Backend
Wraps FastAPI app for Cloud Functions deployment
"""

import os
import sys

# Add app directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from app.main import app
import functions_framework
from mangum import Mangum

# Create Mangum handler for FastAPI app (converts ASGI to WSGI)
handler = Mangum(app, lifespan="off")

@functions_framework.http
def product_gpt_chat_api(request):
    """
    Cloud Function HTTP entry point for FastAPI app
    Converts Cloud Functions Flask request to ASGI and back
    """
    # Convert Flask request to WSGI environ
    environ = {
        'REQUEST_METHOD': request.method,
        'PATH_INFO': request.path,
        'QUERY_STRING': request.query_string or '',
        'CONTENT_TYPE': request.headers.get('Content-Type', ''),
        'CONTENT_LENGTH': str(len(request.get_data())),
        'wsgi.version': (1, 0),
        'wsgi.url_scheme': 'https',
        'wsgi.input': request,
        'wsgi.errors': sys.stderr,
        'wsgi.multithread': False,
        'wsgi.multiprocess': True,
        'wsgi.run_once': False,
        'SERVER_NAME': request.headers.get('Host', ''),
        'SERVER_PORT': '443',
        'HTTP_HOST': request.headers.get('Host', ''),
    }
    
    # Add all headers to environ
    for key, value in request.headers.items():
        key = key.upper().replace('-', '_')
        if key not in ('CONTENT_TYPE', 'CONTENT_LENGTH'):
            key = f'HTTP_{key}'
        environ[key] = value
    
    # Response data
    response_data = {'status': 200, 'headers': {}, 'body': b''}
    
    def start_response(status, headers):
        """WSGI start_response callback"""
        response_data['status'] = int(status.split()[0])
        response_data['headers'] = dict(headers)
    
    # Call Mangum handler (which converts ASGI to WSGI)
    body = handler(environ, start_response)
    
    # Collect response body
    if isinstance(body, bytes):
        response_body = body
    elif isinstance(body, str):
        response_body = body.encode()
    else:
        chunks = []
        try:
            for chunk in body or []:
                if isinstance(chunk, bytes):
                    chunks.append(chunk)
                else:
                    chunks.append(str(chunk).encode())
        finally:
            close_fn = getattr(body, 'close', None)
            if callable(close_fn):
                close_fn()
        response_body = b''.join(chunks)
    
    response_data['body'] = response_body
    
    # Return tuple (body, status_code, headers) for Cloud Functions
    return (
        response_data['body'],
        response_data['status'],
        response_data['headers']
    )
