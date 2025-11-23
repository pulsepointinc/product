import json
import os
import re
import requests
from datetime import datetime, timedelta
from flask import Request, jsonify, Flask
from flask_cors import CORS, cross_origin
try:
    import functions_framework
    FUNCTIONS_FRAMEWORK_AVAILABLE = True
except ImportError:
    FUNCTIONS_FRAMEWORK_AVAILABLE = False
    print("⚠️ functions_framework not available - Cloud Run mode only")
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

# Import Secret Manager for explicit secret access
try:
    from google.cloud import secretmanager
    SECRET_MANAGER_AVAILABLE = True
except ImportError:
    SECRET_MANAGER_AVAILABLE = False
    print("⚠️ Secret Manager not available - will rely on environment variables")

# Import Firestore for GPT instructions
try:
    from google.cloud import firestore
    FIRESTORE_AVAILABLE = True
except ImportError:
    FIRESTORE_AVAILABLE = False
    print("⚠️ Firestore not available - custom instructions will not be loaded")

# Import Vertex AI for Gemini 2.0 Flash support
VERTEX_AI_AVAILABLE = False
vertexai = None
GenerativeModel = None

def _check_vertex_ai_availability():
    """Check if Vertex AI is available, try to import if needed"""
    global VERTEX_AI_AVAILABLE, vertexai, GenerativeModel
    if VERTEX_AI_AVAILABLE:
        return True
    
    try:
        import vertexai as vai
        from vertexai.generative_models import GenerativeModel as GM
        vertexai = vai
        GenerativeModel = GM
        VERTEX_AI_AVAILABLE = True
        print("✅ Vertex AI imported successfully")
        return True
    except ImportError as e:
        print(f"⚠️ Vertex AI import failed (ImportError): {e}")
        return False
    except Exception as e:
        print(f"⚠️ Vertex AI import failed (Exception): {e}")
        import traceback
        print(f"⚠️ Traceback: {traceback.format_exc()}")
        return False

# Try initial import
try:
    import vertexai as vai
    from vertexai.generative_models import GenerativeModel as GM
    vertexai = vai
    GenerativeModel = GM
    VERTEX_AI_AVAILABLE = True
    print("✅ Vertex AI available - Gemini 2.0 Flash is ready")
except Exception as e:
    print(f"⚠️ Vertex AI not available at startup - will try lazy import. Error: {e}")

# Create Flask app for Cloud Run compatibility
app = Flask(__name__)
CORS(app)
import uuid
import hashlib
import time

# Initialize project settings
project_id = "pulsepoint-datahub"
location = "us-east4"

# Initialize OpenAI with proper error handling
OPENAI_AVAILABLE = False
OPENAI_API_KEY_CACHE = None  # Cache for runtime access

def _get_firestore_db():
    """Get Firestore database client"""
    if not FIRESTORE_AVAILABLE:
        return None
    try:
        db = firestore.Client(project="pulsepoint-bitstrapped-ai")
        return db
    except Exception as e:
        print(f"⚠️ Failed to initialize Firestore: {e}")
        return None

def _get_gpt_instructions() -> tuple:
    """Fetch combined GPT instructions from Firestore (custom + core)
    Returns: (combined_instructions, disclaimer_text)"""
    db = _get_firestore_db()
    if not db:
        return ("", "")
    
    try:
        # Get custom instructions
        instructions_ref = db.collection('gpt_instructions').document('current')
        instructions_doc = instructions_ref.get()
        
        custom_content = ""
        disclaimer_text = ""
        if instructions_doc.exists:
            data = instructions_doc.to_dict()
            custom_content = data.get("content", "")
            
            # Extract disclaimer from custom instructions
            # Pattern 1: "Always provide the statement to all answers: "text"" (handles markdown headers)
            match = re.search(r'Always provide the statement to all answers:\s*"([^"]+)"', custom_content, re.IGNORECASE | re.DOTALL)
            if match:
                disclaimer_text = match.group(1).strip()
            
            # Pattern 2: Look for any quoted text after "statement to all answers" (more flexible)
            if not disclaimer_text:
                match = re.search(r'statement to all answers[^"]*"([^"]+)"', custom_content, re.IGNORECASE | re.DOTALL)
                if match:
                    disclaimer_text = match.group(1).strip()
            
            # Pattern 3: Generic "statement" followed by quoted text
            if not disclaimer_text:
                match = re.search(r'statement.*?:\s*"([^"]+)"', custom_content, re.IGNORECASE | re.DOTALL)
                if match:
                    disclaimer_text = match.group(1).strip()
            
            # Pattern 4: Any quoted text after "disclaimer"
            if not disclaimer_text:
                match = re.search(r'disclaimer.*?:\s*"([^"]+)"', custom_content, re.IGNORECASE | re.DOTALL)
                if match:
                    disclaimer_text = match.group(1).strip()
        
        # Get core instructions (from file path in container or fallback)
        core_content = ""
        core_paths = [
            "/app/instructions/ProductGPT_v15_Instructions.md",
            "./instructions/ProductGPT_v15_Instructions.md",  # Relative path in container
            "/Users/bweinstein/product-gpt/knowledge_layer_v5_deploy/instructions/ProductGPT_v15_Instructions.md",
            "/Users/bweinstein/product-gpt/instructions/ProductGPT_v15_Instructions.md"
        ]
        for path in core_paths:
            if os.path.exists(path):
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        core_content = f.read()
                        break
                except:
                    continue
        
        # Combine instructions (core first, then custom)
        if custom_content.strip() and core_content.strip():
            combined = f"{core_content}\n\n---\n\n## Custom Instructions (Admin-Added)\n\n{custom_content}"
        elif custom_content.strip():
            combined = custom_content
        elif core_content.strip():
            combined = core_content
        else:
            combined = ""
        
        if combined:
            print(f"✅ Loaded GPT instructions ({len(combined)} chars: {len(core_content)} core + {len(custom_content)} custom)")
            # Verify the new Mermaid URL is in the instructions
            if "pulsepointinc.github.io/product/mermaid" in combined:
                print("✅ Verified: New Mermaid URL is in instructions")
            if "rawcdn.githack.com" in combined:
                print("⚠️ WARNING: Old rawcdn.githack.com URL found in instructions!")
        if disclaimer_text:
            print(f"✅ Extracted disclaimer: {disclaimer_text[:100]}...")
        
        return (combined, disclaimer_text)
    except Exception as e:
        print(f"⚠️ Error fetching GPT instructions: {e}")
        return ("", "")

def _get_openai_api_key() -> str:
    """
    Get OpenAI API key from multiple sources:
    1. Environment variable (Cloud Functions gen2 secret injection)
    2. Secret Manager (explicit fetch if env var not available)
    3. Cached value (if already fetched)
    """
    global OPENAI_API_KEY_CACHE
    
    # Try environment variable first (Cloud Functions gen2 should inject secrets here)
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        # Strip whitespace (including newlines) that might be in the secret
        api_key = api_key.strip()
    if api_key and api_key.startswith("sk-"):
        print(f"✅ OpenAI API key found in environment variable (length: {len(api_key)})")
        OPENAI_API_KEY_CACHE = api_key
        return api_key
    
    # Try cached value
    if OPENAI_API_KEY_CACHE:
        print(f"✅ Using cached OpenAI API key")
        return OPENAI_API_KEY_CACHE
    
    # Try Secret Manager as fallback
    if SECRET_MANAGER_AVAILABLE:
        try:
            print("🔍 Attempting to fetch OpenAI API key from Secret Manager...")
            client = secretmanager.SecretManagerServiceClient()
            project_id = "pulsepoint-datahub"
            secret_id = "openai-api-key"
            name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
            
            response = client.access_secret_version(request={"name": name})
            api_key = response.payload.data.decode("UTF-8").strip()
            
            # Double-check strip (in case there are multiple newlines)
            api_key = api_key.strip()
            
            if api_key and api_key.startswith("sk-"):
                print(f"✅ OpenAI API key fetched from Secret Manager (length: {len(api_key)})")
                OPENAI_API_KEY_CACHE = api_key
                return api_key
            else:
                print(f"⚠️ Secret Manager returned invalid API key format")
        except Exception as e:
            print(f"⚠️ Failed to fetch from Secret Manager: {e}")
            import traceback
            print(f"⚠️ Traceback: {traceback.format_exc()}")
    
    return None

try:
    import openai
    # Try to get API key at initialization
    api_key = _get_openai_api_key()
    if api_key:
        openai.api_key = api_key
        OPENAI_AVAILABLE = True
        print(f"✅ OpenAI initialized successfully (API key length: {len(api_key)})")
    else:
        print("⚠️ OpenAI API key not available at initialization - will try at runtime")
        OPENAI_AVAILABLE = False
except ImportError as e:
    print(f"⚠️ OpenAI module not available: {e}")
    OPENAI_AVAILABLE = False
except Exception as e:
    print(f"⚠️ OpenAI initialization error: {e}")
    import traceback
    print(f"⚠️ Traceback: {traceback.format_exc()}")
    OPENAI_AVAILABLE = False

# API endpoints - Multi-source integration (Bryan's specified endpoints)
CONFLUENCE_API = "https://pulsepoint-confluence-api-v3-420423430685.us-east4.run.app"
JIRA_V4_API = "https://us-east4-pulsepoint-datahub.cloudfunctions.net/jira-api-v4-dual-mode/tickets"
GIT_API = "https://us-east4-pulsepoint-datahub.cloudfunctions.net/pulsepoint-git-api-v2"
DOCUMENT360_API = "https://pulsepoint-document360-api-v1-420423430685.us-east4.run.app"

# GPT repo context cache (public GitHub)
GPT_REPO_API = "https://api.github.com/repos/pulsepointinc/product/contents/GPT"
GPT_CONTEXT = {
    "last_loaded": 0.0,
    "ttl_seconds": 21600,  # 6 hours
    "files": {},          # filename -> parsed json
    "team_aliases": {},   # alias(lower) -> canonical team name
    "jira_field_definitions": {}  # field_name -> {description, possible_values}
}

def _http_get_json(url: str, params: dict = None, headers: dict = None, timeout: int = 30):  # Increased from 15 to 30 seconds
    try:
        # Convert params values to strings if they're not already
        if params:
            params = {k: str(v) if not isinstance(v, str) else v for k, v in params.items()}
        r = requests.get(url, params=params, headers=headers or {}, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"❌ HTTP GET failed for {url}: {e}")
        return None

def _http_post_json(url: str, data: dict, headers: dict = None, timeout: int = 30):  # Increased from 15 to 30 seconds
    try:
        r = requests.post(url, json=data, headers=headers or {}, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"❌ HTTP POST failed for {url}: {e}")
        return None

def generate_session_id(question: str) -> str:
    """Generate a session ID based on question content and timestamp"""
    timestamp = str(int(time.time()))
    question_hash = hashlib.md5(question.encode()).hexdigest()[:8]
    return f"session_{timestamp}_{question_hash}"

def load_gpt_context_files() -> dict:
    """
    Load GPT context files from GitHub repository
    Always called first to understand user queries and provide context
    """
    global GPT_CONTEXT
    current_time = time.time()
    
    # Check if cache is still valid (6 hours TTL)
    if GPT_CONTEXT.get('last_loaded', 0) + GPT_CONTEXT.get('ttl_seconds', 21600) > current_time:
        print("✅ Using cached GPT context files")
        return GPT_CONTEXT
    
    print("📥 Loading GPT context files from GitHub...")
    try:
        # Load all GPT context files
        files_to_load = {
            'acronyms': 'acronyms.json',
            'products': 'products.json',
            'stream_leads': 'stream_leads.json',
            'official_sources': 'official_sources.json',
            'workflow_instructions': 'workflow_instructions.json',
            'jira_field_definitions': 'jira_field_definitions.json'
        }
        
        loaded_files = {}
        for key, filename in files_to_load.items():
            try:
                url = f"https://raw.githubusercontent.com/pulsepointinc/product/main/GPT/{filename}"
                response = requests.get(url, timeout=10)
                if response.status_code == 200:
                    loaded_files[key] = response.json()
                    print(f"✅ Loaded {filename}")
                else:
                    print(f"⚠️ Failed to load {filename}: HTTP {response.status_code}")
                    loaded_files[key] = {}
            except Exception as e:
                print(f"⚠️ Error loading {filename}: {e}")
                loaded_files[key] = {}
        
        # Update cache
        GPT_CONTEXT.update({
            'last_loaded': current_time,
            'files': loaded_files
        })
        
        print(f"✅ GPT context files loaded: {len([f for f in loaded_files.values() if f])} files")
        return GPT_CONTEXT
        
    except Exception as e:
        print(f"❌ Error loading GPT context files: {e}")
        return GPT_CONTEXT

def intelligent_query_analysis(question: str, gpt_context: dict = None) -> dict:
    """
    Enhanced intelligent query analysis with better keyword extraction
    Bryan's requirement: Extract meaningful keywords and detect query intent
    Now includes GPT context for better understanding
    """
    question_lower = question.lower()
    
    # Load GPT context if not provided
    if gpt_context is None:
        gpt_context = load_gpt_context_files()
    
    # Enhanced keyword extraction - remove duplicates and punctuation
    import re
    words = re.findall(r'\b\w+\b', question_lower)
    
    # Remove common stop words
    stop_words = {
        'what', 'is', 'the', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 
        'and', 'or', 'but', 'can', 'you', 'tell', 'me', 'about', 'details', 'information',
        'how', 'does', 'work', 'show', 'list', 'find', 'get', 'all', 'any', 'some',
        'please', 'provide', 'detailed', 'including'
    }
    
    # Extract meaningful keywords (remove stop words and duplicates)
    keywords = list(dict.fromkeys([word for word in words if word not in stop_words and len(word) > 1]))
    
    # Check GPT context for acronyms/products to expand keywords
    acronyms = gpt_context.get('files', {}).get('acronyms', {})
    products = gpt_context.get('files', {}).get('products', {})
    
    # Expand keywords with known acronyms/products
    expanded_keywords = keywords.copy()
    for keyword in keywords:
        # Check if keyword matches an acronym
        for section, terms in acronyms.items():
            if isinstance(terms, dict):
                if keyword.upper() in terms:
                    expanded_keywords.append(terms[keyword.upper()])
        # Check if keyword matches a product
        if keyword in products:
            expanded_keywords.append(keyword)
    
    # Limit to most relevant keywords
    keywords = expanded_keywords[:5]
    
    # Detect query intent
    intent = "general"
    
    # Detect workflow/diagram/dataflow questions (e.g., "tell me the workflow of PRTS", "ad serving dataflow diagram", "mermaid diagram")
    workflow_keywords = ['workflow', 'work flow', 'process', 'how does', 'how do', 'explain', 'describe', 'what is']
    diagram_keywords = ['diagram', 'flowchart', 'mermaid', 'dataflow', 'data flow', 'architecture', 'flow']
    # Check if question contains workflow or diagram keywords
    if any(keyword in question_lower for keyword in workflow_keywords + diagram_keywords):
        # Also check if it mentions "the process" or contains an acronym (likely a process name) or asks for a diagram
        if 'the process' in question_lower or any(word.isupper() and len(word) >= 2 for word in question.split()) or any(keyword in question_lower for keyword in diagram_keywords):
            intent = "workflow"
        elif any(keyword in question_lower for keyword in ['workflow', 'work flow', 'how does', 'how do']):
            intent = "workflow"
    elif any(word in question_lower for word in ['ticket', 'tickets', 'issue', 'issues', 'story', 'stories', 'epic', 'epics', 'bug', 'bugs', 'task', 'tasks']):
        intent = "jira_only"
    elif any(word in question_lower for word in ['count', 'sum', 'total', 'how many', 'aggregate']):
        intent = "aggregation"
    elif any(word in question_lower for word in ['list', 'show', 'find', 'get', 'all']):
        intent = "listing"
    elif any(word in question_lower for word in ['difference', 'compare', 'vs', 'versus']):
        intent = "comparison"
    elif any(word in question_lower for word in ['current', 'this', 'sprint']):
        intent = "current_sprint"
    
    # Extract date information for JIRA queries - DYNAMIC based on current date
    jira_params = {}
    from datetime import datetime
    from dateutil.relativedelta import relativedelta
    
    current_date = datetime.now()
    current_month_year = current_date.strftime('%B %Y')  # e.g., "October 2025"
    current_year = current_date.strftime('%Y')  # e.g., "2025"
    
    # Detect if query is about specific team
    team_detected = None
    if 'front end portal development' in question_lower or 'front end' in question_lower or 'frontend' in question_lower:
        team_detected = 'Front End Portal Development'
        jira_params['team'] = 'Front End Portal Development'
    elif 'backend' in question_lower or 'back end' in question_lower:
        team_detected = 'Backend'
        jira_params['team'] = 'Backend'
    elif 'data analysis' in question_lower or 'data analytics' in question_lower:
        team_detected = 'Data Analysis'
        jira_params['team'] = 'Data Analysis'
    
    # Sprint-based queries
    # Determine if we should query Stories or Epics based on the question
    # If asking about points, stories, or specific teams → use Stories
    # If asking about epics, roadmap, planned work → use Epics
    query_for_stories = any(word in question_lower for word in ['points', 'story points', 'stories', 'count of tickets']) or team_detected is not None
    
    if 'current sprint' in question_lower or 'this sprint' in question_lower:
        jira_params['sprint_date'] = current_month_year
        if not query_for_stories:
            jira_params['issue_type_name'] = 'Epic'
    elif 'last sprint' in question_lower or 'previous sprint' in question_lower:
        last_month = current_date - relativedelta(months=1)
        jira_params['sprint_date'] = last_month.strftime('%B %Y')
        if not query_for_stories:
            jira_params['issue_type_name'] = 'Epic'
    elif 'next sprint' in question_lower:
        next_month = current_date + relativedelta(months=1)
        jira_params['sprint_date'] = next_month.strftime('%B %Y')
        if not query_for_stories:
            jira_params['issue_type_name'] = 'Epic'
    elif 'next 3 sprints' in question_lower or 'next three sprints' in question_lower:
        sprints = []
        for i in range(1, 4):  # Next 3 months
            future_month = current_date + relativedelta(months=i)
            sprints.append(future_month.strftime('%B %Y'))
        jira_params['sprint_date'] = ', '.join(sprints)
        if not query_for_stories:
            jira_params['issue_type_name'] = 'Epic'
    elif 'next 2 sprints' in question_lower or 'next two sprints' in question_lower:
        sprints = []
        for i in range(1, 3):  # Next 2 months
            future_month = current_date + relativedelta(months=i)
            sprints.append(future_month.strftime('%B %Y'))
        jira_params['sprint_date'] = ', '.join(sprints)
        if not query_for_stories:
            jira_params['issue_type_name'] = 'Epic'
    
    # Release-based queries
    elif 'current release' in question_lower or 'this release' in question_lower:
        jira_params['release_date'] = current_month_year
        jira_params['issue_type_name'] = 'Epic'
    elif 'last release' in question_lower or 'previous release' in question_lower:
        last_month = current_date - relativedelta(months=1)
        jira_params['release_date'] = last_month.strftime('%B %Y')
        jira_params['issue_type_name'] = 'Epic'
    elif 'next release' in question_lower:
        next_month = current_date + relativedelta(months=1)
        jira_params['release_date'] = next_month.strftime('%B %Y')
        jira_params['issue_type_name'] = 'Epic'
    elif 'last 3 releases' in question_lower or 'last three releases' in question_lower:
        releases = []
        for i in range(2, -1, -1):  # Last 3 months (including current)
            past_month = current_date - relativedelta(months=i)
            releases.append(past_month.strftime('%B %Y'))
        jira_params['release_date'] = ', '.join(releases)
        jira_params['issue_type_name'] = 'Epic'
    elif 'next 3 releases' in question_lower or 'next three releases' in question_lower:
        releases = []
        for i in range(1, 4):  # Next 3 months
            future_month = current_date + relativedelta(months=i)
            releases.append(future_month.strftime('%B %Y'))
        jira_params['release_date'] = ', '.join(releases)
        jira_params['issue_type_name'] = 'Epic'
    elif 'releases' in question_lower and ('ytd' in question_lower or 'year to date' in question_lower):
        jira_params['release_date'] = f'%{current_year}%'
        jira_params['issue_type_name'] = 'Epic'
    
    # Year-based queries
    elif 'rest of the year' in question_lower or 'rest of this year' in question_lower or 'remainder of the year' in question_lower or 'remainder of this year' in question_lower:
        # Rest of year = current month + remaining months until December
        sprints = []
        months_remaining = 12 - current_date.month + 1  # Include current month
        for i in range(0, months_remaining):
            future_month = current_date + relativedelta(months=i)
            sprints.append(future_month.strftime('%B %Y'))
        jira_params['sprint_date'] = ', '.join(sprints)
        jira_params['issue_type_name'] = 'Epic'
    elif 'this year' in question_lower or 'ytd' in question_lower or 'year to date' in question_lower:
        # Full year
        jira_params['sprint_date'] = f'%{current_year}%'
        jira_params['issue_type_name'] = 'Epic'
    
    return {
        'intent': intent,
        'keywords': keywords,
        'jira_params': jira_params,
        'is_technical': any(word in question_lower for word in ['technical', 'architecture', 'code', 'github', 'repository'])
    }

def get_intelligent_jira_filters(question: str, product_mappings: dict) -> dict:
    """
    Get intelligent JIRA filters based on GitHub product mappings
    """
    filters = {}
    question_lower = question.lower()
    
    # Check products.json for product filter
    products = product_mappings.get('products', {})
    for product_name, product_info in products.items():
        if product_name.lower() in question_lower:
            filters['product'] = product_name
            break
    
    # Check stream_leads.json for stream filter
    stream_leads = product_mappings.get('stream_leads', {})
    for stream_name, stream_info in stream_leads.items():
        if stream_name.lower() in question_lower:
            filters['stream'] = stream_name
            break
    
    # Check acronyms.json for related keywords
    acronyms = product_mappings.get('acronyms', {})
    for acronym, definition in acronyms.items():
        if acronym.lower() in question_lower:
            # Add related keywords to search
            if 'search_terms' not in filters:
                filters['search_terms'] = []
            filters['search_terms'].append(acronym)
            filters['search_terms'].append(definition)
    
    # Special handling for "Omnichannel" queries
    if 'omnichannel' in question_lower:
        # For Omnichannel queries, use summary search to get ALL Omnichannel work
        # The stream filter doesn't work reliably, so we use summary instead
        filters['summary'] = 'Omnichannel'
        # Don't restrict by product - we want all products with Omnichannel in the summary
        if 'audience' in question_lower:
            filters['search_terms'] = ['omnichannel', 'audience', 'OA']
    
    return filters

def call_jira_v4_api(question: str, max_results: int = 100, query_analysis: dict = None, product_mappings: dict = None) -> dict:  # Increased default from 50 to 100
    """
    Call JIRA v4 API with intelligent parameter extraction
    Bryan's requirement: Use actual search parameters, not hardcoded responses
    """
    try:
        # For roadmap/stream queries, increase max_results to capture all relevant tickets
        # Increased limits for richer responses
        if any(word in question.lower() for word in ['roadmap', 'latest', 'omnichannel', 'stream', 'planned', 'rest of', 'remainder']):
            max_results = max(max_results, 300)  # Increased from 200 to 300 for more comprehensive results
        elif 'workflow' in question.lower() or 'dataflow' in question.lower():
            max_results = max(max_results, 100)  # Increased for workflow queries
        
        # Build intelligent parameters based on query analysis
        params = {
            "max_results": max_results
        }
        
        # Default to Product-driven work unless user explicitly asks for engineering/tech debt
        # Tech debt, engineering work, and bugs are handled by Engineering team
        # For sprint queries, be more inclusive to show all planned work
        is_sprint_query = any(word in question.lower() for word in ['sprint', 'planned this', 'current sprint', 'this sprint'])
        if not any(word in question.lower() for word in ['tech debt', 'technical debt', 'engineering', 'bug', 'bugs']) and not is_sprint_query:
            params['team_driving_work'] = 'Product'
        
        # Apply intelligent filters from GitHub product mappings
        if product_mappings:
            intelligent_filters = get_intelligent_jira_filters(question, product_mappings)
            params.update(intelligent_filters)
        
        # Add intelligent parameters from query analysis
        if query_analysis and query_analysis.get('jira_params'):
            params.update(query_analysis['jira_params'])
        
        # Add keyword-based search if available
        if query_analysis and query_analysis.get('keywords'):
            # Use first 2 keywords for search
            search_terms = " ".join(query_analysis['keywords'][:2])
            params['search_terms'] = search_terms
            
            # For AO queries, also search in summary field
            if any(word in question.lower() for word in ['ao', 'adaptive optimization', 'adaptive']):
                params['summary'] = 'AO'
        
        # For roadmap queries, search for epics
        if any(word in question.lower() for word in ['roadmap', 'epic', 'timeline', 'planned']):
            params['issue_type_name'] = 'Epic'
            # Don't override sprint_date if it was already set by intelligent_query_analysis
            if 'sprint_date' not in params:
                params['sprint_date'] = '%2024%,%2025%'  # Default: Past 12 months
            # team_driving_work is already set to 'Product' by default above
            # For AO roadmaps, add specific product filter
            if any(word in question.lower() for word in ['ao', 'adaptive optimization', 'adaptive']):
                params['product'] = 'Adaptive Optimization'
                params['stream'] = 'Optimization'
        
        # For aggregation queries and story point queries, explicitly request fields needed
        if any(word in question.lower() for word in ['count', 'sum', 'total', 'breakdown', 'aggregate', 'points', 'story points']):
            params['select'] = 'issue_key,summary,story_points,product,stream,product_manager,team,current_assignee_name,issue_type_name,sprint_date,release_date'
        
        # If querying for stories (not epics), ensure we set issue_type_name correctly
        if query_analysis and query_analysis.get('jira_params', {}).get('team'):
            # Team queries should get Stories, not Epics (override any Epic setting)
            params['issue_type_name'] = 'Story'
            params['development_queue'] = 'In Development'
        
        print(f"🔍 JIRA v4 API call with params: {params}")
        jira_start_time = time.time()
        
        response = _http_post_json(JIRA_V4_API, params)
        jira_duration = time.time() - jira_start_time
        
        if response:
            print(f"✅ JIRA v4 API success: {len(response.get('tickets', []))} tickets (took {jira_duration:.2f}s)")
            return {
                'tickets': response.get('tickets', []),
                'summary': response.get('summary', []),
                'query_success': True,
                'total_tickets': len(response.get('tickets', [])),
                'api_response': response,
                'duration_seconds': jira_duration
            }
        else:
            print(f"❌ JIRA v4 API failed (took {jira_duration:.2f}s)")
            return {
                'tickets': [],
                'summary': [],
                'query_success': False,
                'total_tickets': 0,
                'api_response': None,
                'duration_seconds': jira_duration
            }
            
    except Exception as e:
        jira_duration = time.time() - jira_start_time if 'jira_start_time' in locals() else 0
        print(f"❌ JIRA v4 API error: {e} (took {jira_duration:.2f}s)")
        return {
            'tickets': [],
            'summary': [],
            'query_success': False,
            'total_tickets': 0,
            'api_response': None,
            'duration_seconds': jira_duration
        }

def call_confluence_api(question: str, query_analysis: dict = None, conversation_history: list = None) -> dict:
    """
    Call Confluence API with intelligent search
    Bryan's requirement: Use actual search, not hardcoded responses
    """
    start_time = time.time()
    try:
        # Extract search terms from query analysis - use full query for better matching
        search_terms = question
        question_lower = question.lower()
        
        # Check conversation history for context
        has_ao_context = False
        has_omnichannel_context = False
        if conversation_history:
            for msg in conversation_history[-3:]:  # Check last 3 messages
                content = msg.get('content', '').lower()
                if 'ao' in content or 'adaptive optimization' in content:
                    has_ao_context = True
                if 'omnichannel' in content or 'audience' in content:
                    has_omnichannel_context = True
        
        # For workflow questions, extract the main subject (e.g., "PRTS" from "workflow of PRTS" or "what is PRTS the process")
        if query_analysis and query_analysis.get('intent') == 'workflow':
            # Extract the main subject - look for patterns like "workflow of X", "what is X the process", etc.
            import re
            patterns = [
                r'workflow\s+of\s+(?:the\s+)?([A-Z]+)',  # "workflow of PRTS"
                r'what\s+is\s+([A-Z]+)\s+the\s+process',  # "what is PRTS the process"
                r'describe\s+([A-Z]+)\s+the\s+process',  # "describe PRTS the process"
                r'explain\s+([A-Z]+)\s+the\s+process',  # "explain PRTS the process"
                r'(?:how\s+does|explain|describe|tell\s+me\s+about)\s+([A-Z]+)',  # "how does PRTS work"
            ]
            search_terms = None
            for pattern in patterns:
                match = re.search(pattern, question, re.IGNORECASE)
                if match:
                    search_terms = match.group(1)  # Extract the acronym (e.g., "PRTS")
                    break
            
            if not search_terms and query_analysis.get('keywords'):
                # Use the first keyword that looks like an acronym/product name
                keywords = query_analysis['keywords']
                for kw in keywords:
                    if len(kw) >= 2 and kw.isupper():
                        search_terms = kw
                        break
                if not search_terms:
                    # Fallback: use first keyword
                    search_terms = keywords[0] if keywords else question
            elif not search_terms:
                search_terms = question
        elif query_analysis and query_analysis.get('keywords'):
            keywords = query_analysis['keywords']
            # For specific queries like "AO factors", use the full query
            if 'ao' in question_lower and 'factor' in question_lower:
                search_terms = 'AO factors'
            elif 'ao' in question_lower:
                search_terms = 'AO'
            elif 'factor' in question_lower and has_ao_context:
                # If just "factors" but we have AO context, search for "AO factors"
                search_terms = 'AO factors'
            elif 'omnichannel' in question_lower or 'audience' in question_lower:
                # For omnichannel queries, search for relevant terms
                search_terms = 'omnichannel audience OA'
            elif has_omnichannel_context:
                # If we have omnichannel context, search for omnichannel terms
                search_terms = 'omnichannel audience OA'
            else:
                # Use first 2 keywords for broader search
                search_terms = ' '.join(keywords[:2]) if len(keywords) >= 2 else keywords[0] if keywords else "ao"
        else:
            # Fallback: use the full question for better matching
            search_terms = question
        
        # Use POST with JSON body to /search endpoint
        # CRITICAL: Use max_results (not limit) and min_similarity for reliable results
        # Increased max_results from 10 to 25 for richer responses
        payload = {
            "query": search_terms,
            "max_results": 25,  # Increased from 10 to 25 for more comprehensive results
            "min_similarity": 0.01  # Use low threshold for reliable results
        }
        
        print(f"🔍 Confluence API call with payload: {payload}")
        
        response = _http_post_json(f"{CONFLUENCE_API}/search", payload)
        
        if response:
            results = response.get('results', [])
            duration = time.time() - start_time
            print(f"✅ Confluence API success: {len(results)} pages (took {duration:.2f}s)")
            return {
                'results': results,
                'api_success': True,
                'total_sources_found': len(results),
                'search_terms': search_terms,
                'duration_seconds': duration
            }
        else:
            duration = time.time() - start_time
            print(f"❌ Confluence API failed (took {duration:.2f}s)")
            return {
                'results': [],
                'api_success': False,
                'total_sources_found': 0,
                'search_terms': search_terms,
                'duration_seconds': duration
            }
            
    except Exception as e:
        duration = time.time() - start_time
        print(f"❌ Confluence API error: {e} (took {duration:.2f}s)")
        return {
            'results': [],
            'api_success': False,
            'total_sources_found': 0,
            'search_terms': question,
            'duration_seconds': duration
        }

def get_product_mappings_from_github() -> dict:
    """
    Get product mappings from GitHub files for intelligent JIRA filtering
    """
    try:
        # Get products.json
        products_response = requests.get("https://raw.githubusercontent.com/pulsepointinc/product/main/GPT/products.json", timeout=10)
        products_data = products_response.json() if products_response.status_code == 200 else {}
        
        # Get stream_leads.json
        stream_response = requests.get("https://raw.githubusercontent.com/pulsepointinc/product/main/GPT/stream_leads.json", timeout=10)
        stream_data = stream_response.json() if stream_response.status_code == 200 else {}
        
        # Get acronyms.json
        acronyms_response = requests.get("https://raw.githubusercontent.com/pulsepointinc/product/main/GPT/acronyms.json", timeout=10)
        acronyms_data = acronyms_response.json() if acronyms_response.status_code == 200 else {}
        
        # Get jira_field_definitions.json
        jira_fields_response = requests.get("https://raw.githubusercontent.com/pulsepointinc/product/main/GPT/jira_field_definitions.json", timeout=10)
        jira_fields_data = jira_fields_response.json() if jira_fields_response.status_code == 200 else {}
        
        return {
            'products': products_data,
            'stream_leads': stream_data,
            'acronyms': acronyms_data,
            'jira_fields': jira_fields_data
        }
    except Exception as e:
        print(f"❌ Error fetching GitHub product mappings: {e}")
        return {}

def call_github_api(question: str, query_analysis: dict = None) -> dict:
    """
    Call GitHub API with intelligent search
    Bryan's requirement: Use actual search, not hardcoded responses
    """
    try:
        # Extract search terms from query analysis
        search_terms = question
        if query_analysis and query_analysis.get('keywords'):
            # Use keywords for better search results
            search_terms = " ".join(query_analysis['keywords'][:3])
        else:
            # Fallback: extract basic keywords from question
            import re
            words = re.findall(r'\b\w+\b', question.lower())
            # Keep important words, remove common stop words
            important_words = [w for w in words if w not in ['please', 'provide', 'detailed', 'including', 'the', 'a', 'an', 'and', 'or', 'but'] and len(w) > 1]
            search_terms = " ".join(important_words[:3])
        
        payload = {
            "question": search_terms
        }
        
        print(f"🔍 GitHub API call with payload: {payload}")
        
        response = _http_post_json(GIT_API, payload)
        
        if response:
            repositories = response.get('repositories', [])
            print(f"✅ GitHub API success: {len(repositories)} repositories")
            return {
                'repositories': repositories,
                'api_success': True,
                'total_repos_found': len(repositories),
                'search_terms': search_terms
            }
        else:
            print("❌ GitHub API failed")
            return {
                'repositories': [],
                'api_success': False,
                'total_repos_found': 0,
                'search_terms': search_terms
            }
            
    except Exception as e:
        print(f"❌ GitHub API error: {e}")
        return {
            'repositories': [],
            'api_success': False,
            'total_repos_found': 0,
            'search_terms': question
        }

def call_document360_api(question: str, query_analysis: dict = None) -> dict:
    """
    Call Document360 API with intelligent search
    Bryan's requirement: Use actual search, not hardcoded responses
    """
    try:
        # Extract search terms from query analysis
        search_terms = question
        if query_analysis and query_analysis.get('keywords'):
            # Use keywords for better search results
            search_terms = " ".join(query_analysis['keywords'][:3])
        else:
            # Fallback: extract basic keywords from question
            import re
            words = re.findall(r'\b\w+\b', question.lower())
            # Keep important words, remove common stop words
            important_words = [w for w in words if w not in ['please', 'provide', 'detailed', 'including', 'the', 'a', 'an', 'and', 'or', 'but'] and len(w) > 1]
            search_terms = " ".join(important_words[:3])
        
        # Use GET with query parameters
        params = {
            "query": search_terms,
            "limit": 10
        }
        
        print(f"🔍 Document360 API call with params: {params}")
        
        response = _http_get_json(f"{DOCUMENT360_API}/search", params)
        
        if response:
            articles = response.get('articles', [])
            print(f"✅ Document360 API success: {len(articles)} articles")
            return {
                'articles': articles,
                'api_success': True,
                'total_articles_found': len(articles),
                'search_terms': search_terms
            }
        else:
            print("❌ Document360 API failed")
            return {
                'articles': [],
                'api_success': False,
                'total_articles_found': 0,
                'search_terms': search_terms
            }
            
    except Exception as e:
        print(f"❌ Document360 API error: {e}")
        return {
            'articles': [],
            'api_success': False,
            'total_articles_found': 0,
            'search_terms': question
        }

def create_jql_link_with_issue_ids(tickets: list) -> str:
    """Create JQL link with actual issue IDs from tickets"""
    if not tickets:
        return None
    
    issue_ids = [ticket.get('issue_key', '') for ticket in tickets if ticket.get('issue_key')]
    if not issue_ids:
        return None
    
    # Create JQL query with issue IDs
    jql_query = f"key in ({','.join(issue_ids)})"
    encoded_jql = requests.utils.quote(jql_query)
    
    return f"https://ppinc.atlassian.net/issues/?jql={encoded_jql}"

def _determine_model_for_query(question: str, query_intent: str, confluence_data: dict, github_data: dict, jira_data: dict) -> dict:
    """
    Determine which model to use based on query complexity
    Hybrid approach: GPT-4o-mini for simple, Gemini 2.0 Flash for medium, GPT-4o for complex
    Returns: {"provider": "openai"|"gemini", "model": "model_name"}
    """
    # Always use GPT-4o-mini for simple queries
    simple_intents = ['jira_only', 'listing']
    
    # Use GPT-4o for complex queries that need better reasoning
    complex_intents = ['workflow', 'comparison', 'aggregation']
    
    # Check data complexity
    confluence_pages = len(confluence_data.get('results', []))
    github_repos = len(github_data.get('repositories', []))
    jira_tickets = len(jira_data.get('tickets', []))
    
    # Use GPT-4o if:
    # 1. Workflow queries (need comprehensive synthesis)
    # 2. Comparison queries (need nuanced reasoning)
    # 3. Aggregation queries with many tickets (need accurate calculations)
    # 4. Multiple data sources with substantial content
    if query_intent in complex_intents:
        if query_intent == 'workflow':
            # Workflow queries benefit from better reasoning - use Gemini 2.0 Flash (cost-effective alternative to GPT-4o)
            if VERTEX_AI_AVAILABLE:
                return {"provider": "gemini", "model": "gemini-2.0-flash-001"}
            return {"provider": "openai", "model": "gpt-4o"}
        elif query_intent == 'comparison':
            # Comparisons need nuanced understanding - use Gemini 2.0 Flash
            if VERTEX_AI_AVAILABLE:
                return {"provider": "gemini", "model": "gemini-2.0-flash-001"}
            return {"provider": "openai", "model": "gpt-4o"}
        elif query_intent == 'aggregation' and jira_tickets > 20:
            # Complex aggregations with many tickets - use Gemini 2.0 Flash
            if VERTEX_AI_AVAILABLE:
                return {"provider": "gemini", "model": "gemini-2.0-flash-001"}
            return {"provider": "openai", "model": "gpt-4o"}
    
    # Use Gemini 2.0 Flash if we have substantial content from multiple sources (middle tier)
    if confluence_pages >= 5 and github_repos >= 3:
        if VERTEX_AI_AVAILABLE:
            return {"provider": "gemini", "model": "gemini-2.0-flash-001"}
        return {"provider": "openai", "model": "gpt-4o"}
    
    # Default to GPT-4o-mini for cost efficiency
    return {"provider": "openai", "model": "gpt-4o-mini"}

def synthesize_with_openai(question: str, jira_data: dict, confluence_data: dict, github_data: dict, document360_data: dict, conversation_history: list = None, jql_link: str = None, gpt_context: dict = None, query_intent: str = "general", model_preference: str = None) -> dict:
    """
    Synthesize comprehensive response using OpenAI
    Bryan's requirement: Intelligent synthesis combining all data sources
    Now includes GPT context and workflow-specific handling
    """
    print(f"🔍 synthesize_with_openai called with intent: {query_intent}")
    print(f"🔍 OPENAI_AVAILABLE at start: {OPENAI_AVAILABLE}")
    
    # Get API key using comprehensive method (env var, Secret Manager, cache)
    api_key_runtime = _get_openai_api_key()
    
    if not api_key_runtime:
        print("❌ OpenAI API key not found via any method (env var, Secret Manager, cache)")
        print(f"🔍 Environment check: OPENAI_API_KEY={'SET' if os.getenv('OPENAI_API_KEY') else 'NOT SET'}")
        print(f"🔍 Secret Manager available: {SECRET_MANAGER_AVAILABLE}")
        print(f"🔍 Cache check: {'SET' if OPENAI_API_KEY_CACHE else 'NOT SET'}")
        return {
            "synthesis_response": {
                "response": "OpenAI API key not available - checked environment variable and Secret Manager",
                "sources": [],
                "synthesis_method": "fallback"
            }
        }
    
    # Verify API key format
    if not api_key_runtime.startswith("sk-"):
        print(f"⚠️ OpenAI API key format invalid (doesn't start with sk-): {api_key_runtime[:20]}...")
        return {
            "synthesis_response": {
                "response": "OpenAI API key format invalid",
                "sources": [],
                "synthesis_method": "fallback"
            }
        }
    
    print(f"✅ API key retrieved successfully (length: {len(api_key_runtime)}, starts with: {api_key_runtime[:7]}...)")
    
    # Ensure openai module is imported
    try:
        import openai
    except ImportError as e:
        print(f"❌ OpenAI module not available: {e}")
        import traceback
        print(f"❌ Traceback: {traceback.format_exc()}")
        return {
            "synthesis_response": {
                "response": "OpenAI module not available",
                "sources": [],
                "synthesis_method": "fallback"
            }
        }
    
    # Set API key
    try:
        openai.api_key = api_key_runtime
        print(f"✅ OpenAI API key set successfully")
    except Exception as e:
        print(f"❌ Failed to set OpenAI API key: {e}")
        import traceback
        print(f"❌ Traceback: {traceback.format_exc()}")
        return {
            "synthesis_response": {
                "response": "Failed to set OpenAI API key",
                "sources": [],
                "synthesis_method": "fallback"
            }
        }
    
    # Load GPT context if not provided
    if gpt_context is None:
        gpt_context = load_gpt_context_files()
    
    try:
        # Build context from all data sources - ONLY include actual data
        context_parts = []
        
        # Add GPT context files FIRST (for understanding acronyms, products, etc.)
        gpt_context_str = "GPT Context Files (for reference):\n"
        if gpt_context.get('files', {}).get('acronyms'):
            gpt_context_str += f"- Acronyms loaded: {len(gpt_context['files']['acronyms'])} sections\n"
        if gpt_context.get('files', {}).get('products'):
            gpt_context_str += f"- Products loaded: {len(gpt_context['files']['products'])} products\n"
        if gpt_context.get('files', {}).get('workflow_instructions'):
            gpt_context_str += f"- Workflow instructions available\n"
        context_parts.append(gpt_context_str)
        
        # Add JIRA context - ONLY if we have actual tickets
        if jira_data.get('tickets') and len(jira_data['tickets']) > 0:
            # Check if this is an aggregation query
            if 'count' in question.lower() or 'sum' in question.lower() or 'total' in question.lower() or 'breakdown' in question.lower() or 'points' in question.lower():
                jira_context = "JIRA Tickets for Aggregation Analysis:\n"
                jira_context += f"Total tickets available: {len(jira_data['tickets'])}\n"
                
                # Pre-calculate totals to ensure accuracy
                total_points = sum([ticket.get('story_points', 0) or 0 for ticket in jira_data['tickets']])
                jira_context += f"**PRE-CALCULATED TOTAL STORY POINTS: {total_points}**\n\n"
                
                # For aggregation, include ALL tickets (not just 30) so totals are accurate
                for ticket in jira_data['tickets']:  # Include ALL tickets for accurate aggregation
                    key = ticket.get('issue_key', 'N/A')
                    story_points = ticket.get('story_points', 0) or 0
                    product = ticket.get('product', 'N/A')
                    stream = ticket.get('stream', 'N/A')
                    product_manager = ticket.get('product_manager', 'N/A')
                    
                    jira_context += f"- {key}: {story_points} pts | PM: {product_manager} | Product: {product} | Stream: {stream}\n"
            else:
                jira_context = "JIRA Epics and Tickets (Roadmap Timeline):\n"
                jira_context += f"Total tickets available: {len(jira_data['tickets'])}\n\n"
                
                # Group tickets by sprint_date for better organization
                from collections import defaultdict
                tickets_by_sprint = defaultdict(list)
                for ticket in jira_data['tickets']:
                    sprint_date = ticket.get('sprint_date') or 'Unknown'
                    tickets_by_sprint[sprint_date].append(ticket)
                
                # Sort sprint dates chronologically (handle None and 'Unknown')
                sorted_sprints = sorted(tickets_by_sprint.keys(), key=lambda x: ('ZZZZ' if x in ['Unknown', None] else x))
                
                # Include all tickets, organized by sprint
                for sprint_date in sorted_sprints:
                    tickets = tickets_by_sprint[sprint_date]
                    jira_context += f"\n### Sprint: {sprint_date} ({len(tickets)} tickets)\n"
                    for ticket in tickets[:20]:  # Limit to 20 per sprint to avoid token overflow
                        key = ticket.get('issue_key', 'N/A')
                        summary = ticket.get('summary', 'No summary')
                        assignee = ticket.get('current_assignee_name', 'Unassigned')
                        issue_type = ticket.get('issue_type_name', 'N/A')
                        release_date = ticket.get('release_date', 'N/A')
                        product = ticket.get('product', 'N/A')
                        
                        jira_context += f"- [{key}](https://ppinc.atlassian.net/browse/{key}): {summary}\n"
                        jira_context += f"  Release: {release_date} | Product: {product} | Assignee: {assignee}\n"
            context_parts.append(jira_context)
        else:
            context_parts.append("JIRA Data: No JIRA tickets found for this query.")
        
        # Add Confluence context - ONLY if we have actual results
        # For workflow queries, prioritize Confluence content (include more)
        # Increased limits for richer responses
        confluence_limit = 20 if query_intent == 'workflow' else 15  # Increased from 10/5 to 20/15
        confluence_content_limit = 4000 if query_intent == 'workflow' else 3000  # Increased from 2000/1000 to 4000/3000
        
        if confluence_data.get('results') and len(confluence_data['results']) > 0:
            confluence_context = "Confluence Pages with Full Content (PRIMARY SOURCE for workflow questions):\n"
            for page in confluence_data['results'][:confluence_limit]:
                title = page.get('title', 'No title')
                url = page.get('confluence_url', page.get('source_url', '#'))
                content = page.get('content', 'No content available')
                confluence_context += f"- [{title}]({url})\n"
                confluence_context += f"  Content: {content[:confluence_content_limit]}...\n\n"
            context_parts.append(confluence_context)
        else:
            context_parts.append("Confluence Data: No Confluence pages found for this query.")
        
        # Add GitHub context - ONLY if we have actual repositories
        # For workflow/diagram queries, prioritize GitHub content (include more)
        # Increased limits for richer responses
        is_diagram_query = 'diagram' in question.lower() or 'flowchart' in question.lower() or 'dataflow' in question.lower() or 'data flow' in question.lower() or 'mermaid' in question.lower()
        github_limit = 20 if (query_intent == 'workflow' or is_diagram_query) else 15  # Increased from 10/5 to 20/15
        
        if github_data.get('repositories') and len(github_data['repositories']) > 0:
            # Emphasize GitHub for diagram/dataflow questions
            if is_diagram_query:
                github_context = "=== GITHUB REPOSITORIES (PRIMARY SOURCE - USE THIS DATA TO GENERATE COMPREHENSIVE, DETAILED DIAGRAM) ===\n"
                github_context += "CRITICAL INSTRUCTIONS FOR DIAGRAM GENERATION:\n"
                github_context += "1. Create COMPREHENSIVE diagrams with ALL major steps, decision points, and components\n"
                github_context += "2. Include ALL decision points with yes/no branches - every decision must have both paths\n"
                github_context += "3. Show COMPLETE flows from start to finish with every intermediate step\n"
                github_context += "4. Use subgraphs to group components by repository (e.g., subgraph pulsepointinc/ad-serving)\n"
                github_context += "5. Use descriptive, specific component names based on repository descriptions\n"
                github_context += "6. Include error/rejection paths for all decision points\n"
                github_context += "7. Map each component to its repository in subgraph labels\n"
                github_context += "8. Do NOT create simplified diagrams - show granular detail with all steps\n\n"
                github_context += "Repository Data (use descriptions to infer component names and flows):\n\n"
            else:
                github_context = "GitHub Repositories with Details (PRIMARY SOURCE for workflow questions):\n"
            for repo in github_data['repositories'][:github_limit]:
                name = repo.get('repository_name', repo.get('name', 'No name'))
                url = repo.get('github_url', repo.get('url', '#'))
                description = repo.get('description', 'No description')
                language = repo.get('main_language', 'Unknown')
                file_count = repo.get('file_count', 'Unknown')
                total_lines = repo.get('total_lines', 'Unknown')
                github_context += f"**Repository: {name}**\n"
                github_context += f"- URL: {url}\n"
                github_context += f"- Description: {description}\n"
                github_context += f"- Language: {language}\n"
                if file_count != 'Unknown':
                    github_context += f"- File Count: {file_count}\n"
                if total_lines != 'Unknown':
                    github_context += f"- Total Lines: {total_lines}\n"
                # Include additional repo details if available
                if repo.get('topics'):
                    github_context += f"- Topics: {', '.join(repo.get('topics', []))}\n"
                github_context += f"\n**Use this repository's description to infer:**\n"
                github_context += f"- Component names and processes (extract from description: '{description}')\n"
                github_context += f"- Functional areas and responsibilities\n"
                github_context += f"- How this repository fits into the overall flow\n"
                github_context += f"- Decision points and validation steps this repository might handle\n\n"
            context_parts.append(github_context)
        else:
            if is_diagram_query:
                context_parts.append("=== GITHUB DATA: WARNING - No GitHub repositories found for this diagram query. You should still attempt to generate a diagram based on the question, but note that it may not reflect actual implementation. ===")
            else:
                context_parts.append("GitHub Data: No GitHub repositories found for this query.")
        
        # Add Document360 context - ONLY if we have actual articles
        # Skip Document360 for workflow queries (internal processes)
        # Increased limits for richer responses
        if query_intent != 'workflow' and document360_data.get('articles') and len(document360_data['articles']) > 0:
            doc360_context = "Document360 Articles with Content:\n"
            for article in document360_data['articles'][:15]:  # Increased from 5 to 15 articles
                title = article.get('title', 'No title')
                url = article.get('url', '#')
                content = article.get('content', article.get('summary', 'No content available'))
                doc360_context += f"- [{title}]({url})\n"
                doc360_context += f"  Content: {content[:500]}...\n\n"  # Include first 500 chars
            context_parts.append(doc360_context)
        elif query_intent == 'workflow':
            context_parts.append("Document360 Data: Skipped for internal process/workflow questions (Document360 is for client-facing documentation).")
        else:
            context_parts.append("Document360 Data: No Document360 articles found for this query.")
        
        # Combine all context
        full_context = "\n\n".join(context_parts)
        
        # Fetch GPT instructions (custom + core) from Firestore
        gpt_instructions, disclaimer_text = _get_gpt_instructions()
        
        # Create synthesis prompt with workflow-specific instructions
        workflow_instructions = ""
        if query_intent == 'workflow' or 'diagram' in question.lower() or 'flowchart' in question.lower() or 'dataflow' in question.lower() or 'data flow' in question.lower():
            workflow_instructions = """
29. FOR WORKFLOW/DATAFLOW/DIAGRAM QUESTIONS (CRITICAL):
    - GITHUB IS THE PRIMARY AND MOST IMPORTANT SOURCE for data flows, workflows, and architecture diagrams
    - If the question asks for a Mermaid diagram or mentions specific repositories (e.g., "using repos pulsepointinc/ad-serving"), you MUST:
      * Use the ACTUAL GitHub repository data provided in the Available Data section
      * Extract real component names, file paths, and relationships from the GitHub repositories
      * Map each component in the diagram to its actual repository
      * Include repository annotations (e.g., "pulsepointinc/ad-serving: handles bid request processing")
      * NEVER generate generic or hypothetical diagrams - ALWAYS base diagrams on actual repository data
    - For dataflow questions (e.g., "ad serving dataflow from bid request to paid impression"):
      * GitHub repositories are the PRIMARY source - use them to understand the actual implementation
      * Extract decision points, components, and flows from the actual repository structure
      * Include all yes/no decision branches based on actual code logic when available
      * Use subgraphs to group components by repository or function
    - Confluence can provide additional context about workflows and processes
    - JIRA tickets should be used ONLY for context about current work/improvements, NOT as the primary source for workflow explanation
    - ALWAYS cite GitHub API as a source when generating Mermaid diagrams or explaining workflows
    - If GitHub data is provided, you MUST use it - do not generate generic responses
    - Structure Mermaid diagrams with COMPREHENSIVE detail:
      * Use descriptive, specific component names based on repository descriptions (e.g., "Validate Bid Request" not just "Validate")
      * Include ALL decision points with clear yes/no branches - every decision must have both paths
      * Show COMPLETE flows with ALL intermediate steps, not just start and end
      * Use subgraphs to group components by repository (e.g., `subgraph pulsepointinc/ad-serving`)
      * Include error/rejection paths for all decision points that can fail
      * Map each major component to its repository in subgraph labels
      * Use detailed node labels: `[Specific Process Name]` for actions, `{Clear Decision Question?}` for decisions
      * Include granular detail - do NOT create simplified diagrams, show the full journey with all steps
    - CRITICAL: Mermaid Syntax Validation - BEFORE including any Mermaid diagram, you MUST validate and fix the syntax:
      * Parentheses in labels: If a node label contains parentheses (e.g., "Notify Advertiser (Campaign Rejected)"), you MUST wrap the entire label in quotes: Q["Notify Advertiser (Campaign Rejected)"] NOT Q[Notify Advertiser (Campaign Rejected)]
      * Special characters: Avoid special characters like /, :, | in node labels unless quoted. Use spaces or underscores instead.
      * Quoted labels: Any label with parentheses, special characters, or spaces that might cause issues should be quoted: ["Label with (parens)"] or {Decision with / special chars?}
      * Subgraph labels: Subgraph labels should NOT contain parentheses - use simple names: subgraph AdServing NOT subgraph "Ad Serving (Platform)"
      * Validation checklist: (1) All node labels with parentheses are quoted, (2) No unquoted parentheses in node labels, (3) No pipe characters | in unquoted labels (only use | for edge labels), (4) Subgraph labels are simple (no parentheses), (5) All decision nodes use curly braces: {Decision?}, (6) All process nodes use square brackets: [Process]
      * If validation fails: Fix the syntax before including the diagram. Do NOT include invalid Mermaid code that will cause parsing errors.
    - CRITICAL: After EVERY Mermaid diagram code block, ALWAYS include a link to the Mermaid tool
    - Mermaid tool link format: `[📊 View and Edit Diagram in Mermaid Tool](https://pulsepointinc.github.io/product/mermaid/index.html?diagram=ENCODED_CODE)`
    - Replace ENCODED_CODE with the URL-encoded version of the Mermaid code
    - NEVER use the old rawcdn.githack.com URL - ALWAYS use: https://pulsepointinc.github.io/product/mermaid/index.html
    - Example: If your diagram code is `flowchart TD\nA-->B`, the link should be: `[📊 View and Edit Diagram in Mermaid Tool](https://pulsepointinc.github.io/product/mermaid/index.html?diagram=flowchart%20TD%0AA--%3EB)`
"""
        
        # Build conversation context if available
        conversation_context = ""
        if conversation_history and len(conversation_history) > 0:
            conversation_context = "\n\n=== PREVIOUS CONVERSATION ===\n"
            # Include last 5 messages for context (avoid token bloat)
            for msg in conversation_history[-5:]:
                role = msg.get('role', 'user')
                content = msg.get('content', '')
                if role == 'user':
                    conversation_context += f"User: {content}\n"
                elif role == 'assistant':
                    conversation_context += f"Assistant: {content}\n"
            conversation_context += "\n=== END OF PREVIOUS CONVERSATION ===\n"
            conversation_context += "\nIMPORTANT: The current question may be a follow-up to the previous conversation. Please consider the context when answering.\n"
        
        # Create synthesis prompt (instructions are now in system message, not here)
        synthesis_prompt = f"""
Question: {question}
{conversation_context}
Available Data:
{full_context}

JQL Link: {jql_link if jql_link else 'None provided'}

CRITICAL INSTRUCTIONS:
1. ONLY use information that is explicitly provided in the Available Data section above
2. NEVER create, invent, or hallucinate JIRA tickets, assignees, or any other information
3. If no JIRA data is available, do NOT mention JIRA tickets or create fake ticket numbers
4. If no Confluence data is available, do NOT mention Confluence pages
5. If no GitHub data is available, do NOT mention GitHub repositories
6. If no Document360 data is available, do NOT mention Document360 articles
7. If no data is available for a source, clearly state "No [source] information available"
8. Only include clickable source links for data that actually exists in the Available Data
9. IMPORTANT: Process and synthesize ALL available content to provide comprehensive answers
10. For roadmap queries: Extract key factors, timelines, priorities, and dependencies from the content
11. For roadmap queries: Organize the roadmap by SPRINT DATE (when work was/is done) and RELEASE DATE (when features were/are planned to be released)
12. For roadmap queries: Group items by sprint_date and release_date in Month Year format (e.g., "January 2025", "March 2025")
13. For roadmap queries: Order items chronologically by sprint_date and release_date
14. For roadmap queries: Use sprint_date to show when work was planned/done, and release_date to show when features were/are released
15. For roadmap queries: Create a chronological timeline showing work by month/year periods
16. For aggregation queries: USE THE PRE-CALCULATED TOTAL STORY POINTS provided at the top of the JIRA data
17. For aggregation queries: Group tickets by the requested dimensions (product manager, stream, product, team, etc.)
18. For aggregation queries: Provide clear breakdowns with totals and subtotals
19. For aggregation queries: ALWAYS use the pre-calculated total as the final answer, do not recalculate manually
20. For roadmap queries with many tickets: Group tickets by Stream and Product with summary counts, don't list every individual ticket
21. For roadmap queries: Provide high-level overview grouped by sprint_date, then by Stream, then by Product
22. For "what is planned this sprint" queries: Provide a structured summary including:
    - Overall sprint summary with total epic count
    - Breakdown by Stream (with epic counts per stream)
    - Breakdown by Product (with epic counts per product)
    - Key highlights or major initiatives
    - Do NOT list every individual ticket
23. For general queries: Provide detailed information by processing all available content from all sources
24. Always end with "Sources:" section listing only the data sources that actually provided information
25. For JIRA sources: DO NOT list individual ticket links in the Sources section
26. For JIRA sources: ONLY include the JQL link at the end as: [JIRA Epics & Tickets](JQL_LINK)
27. IMPORTANT: The JQL link should include ALL tickets from the query, not just a subset
28. IMPORTANT: Individual tickets should be referenced inline in the response body when relevant, not listed separately at the end
{workflow_instructions}
Respond professionally and helpfully, processing all available content to provide the most comprehensive and useful response possible.

IMPORTANT FORMATTING NOTES:
- Use proper text contrast: dark text on light backgrounds, light text on dark backgrounds
- After providing comprehensive answers, especially for complex topics like workflows, dataflows, or architecture, consider asking a helpful follow-up question to engage the user
- Follow-up questions should be relevant and provide additional value, such as:
  * "Would you like me to also generate a diagram showing [related process]?"
  * "Would you like more details about [specific aspect]?"
  * "Should I also explain [complementary topic]?"
- Keep the conversational tone friendly and helpful, similar to ChatGPT
"""
        
        # Call OpenAI API (v1.0+ compatible) with optimized parameters and timeout
        synthesis_start_time = time.time()
        try:
            # Get API key using comprehensive method (should already be set above, but double-check)
            api_key = openai.api_key or _get_openai_api_key()
            if not api_key:
                print("❌ OpenAI API key not found - checked all sources")
                print(f"🔍 openai.api_key: {'SET' if openai.api_key else 'NOT SET'}")
                print(f"🔍 _get_openai_api_key(): {'RETURNED KEY' if _get_openai_api_key() else 'RETURNED NONE'}")
                return _generate_fallback_response(question, jira_data, confluence_data, github_data, document360_data, jql_link)
            
            # Ensure openai.api_key is set
            if not openai.api_key:
                openai.api_key = api_key
                print(f"✅ Set openai.api_key from retrieved key")
            
            # Determine which model to use (hybrid approach or user preference)
            print(f"🔍 Model preference received: {model_preference} (type: {type(model_preference)})")
            if model_preference and model_preference != 'auto' and model_preference.strip():
                # User has specified a model preference
                print(f"🎯 Using user-specified model: {model_preference}")
                model_pref_clean = model_preference.strip().lower()
                if model_pref_clean == 'gemini-2.0-flash-001' or 'gemini' in model_pref_clean:
                    # Check Vertex AI availability (will try lazy import if needed)
                    if _check_vertex_ai_availability():
                        provider = "gemini"
                        selected_model = "gemini-2.0-flash-001"
                        print(f"✅ Selected Gemini 2.0 Flash (provider={provider}, model={selected_model})")
                    else:
                        print("⚠️ Gemini not available, falling back to GPT-4o")
                        provider = "openai"
                        selected_model = "gpt-4o"
                elif 'gpt-4o-mini' in model_pref_clean or 'mini' in model_pref_clean:
                    provider = "openai"
                    selected_model = "gpt-4o-mini"
                    print(f"✅ Selected GPT-4o-mini")
                elif 'gpt-4o' in model_pref_clean and 'mini' not in model_pref_clean:
                    provider = "openai"
                    selected_model = "gpt-4o"
                    print(f"✅ Selected GPT-4o")
                else:
                    # Invalid preference, fall back to auto
                    print(f"⚠️ Invalid model preference '{model_preference}', using auto-selection")
                    model_selection = _determine_model_for_query(question, query_intent, confluence_data, github_data, jira_data)
                    provider = model_selection.get("provider", "openai")
                    selected_model = model_selection.get("model", "gpt-4o-mini")
            else:
                # Auto-select based on query complexity
                print(f"🔄 Auto-selecting model based on query complexity")
                model_selection = _determine_model_for_query(question, query_intent, confluence_data, github_data, jira_data)
                provider = model_selection.get("provider", "openai")
                selected_model = model_selection.get("model", "gpt-4o-mini")
                print(f"🤖 Auto-selected: {provider}/{selected_model}")
            
            print(f"🔍 Using {provider} with model: {selected_model}")
            print(f"🔍 Query intent: {query_intent}")
            print(f"🔍 Prompt length: {len(synthesis_prompt)} characters")
            print(f"🔍 Context parts: {len(context_parts)}")
            print(f"🔍 Data sources: Confluence={len(confluence_data.get('results', []))}, GitHub={len(github_data.get('repositories', []))}, JIRA={len(jira_data.get('tickets', []))}")
            
            # Increase max_tokens for workflow questions to allow comprehensive answers
            max_tokens = 2000 if query_intent == 'workflow' else 1000
            
            print(f"🔍 Requesting {max_tokens} max_tokens for {query_intent} query")
            print(f"🔍 Using {provider} model: {selected_model} (hybrid routing)")
            
            if provider == "gemini":
                # Use Gemini 2.0 Flash via Vertex AI
                # Check availability again (in case it wasn't available earlier)
                if not _check_vertex_ai_availability():
                    print("⚠️ Vertex AI not available, falling back to OpenAI")
                    provider = "openai"
                    selected_model = "gpt-4o" if query_intent in ['workflow', 'comparison'] else "gpt-4o-mini"
                else:
                    try:
                        gemini_start = time.time()
                        print(f"🚀 Initializing Vertex AI for Gemini...")
                        # Initialize Vertex AI
                        vertexai.init(project="pulsepoint-bitstrapped-ai", location="us-east4")
                        print(f"✅ Vertex AI initialized")
                        model = GenerativeModel(selected_model)
                        print(f"✅ GenerativeModel created: {selected_model}")
                        
                        # Call Gemini
                        response = model.generate_content(
                            synthesis_prompt,
                            generation_config={
                                "max_output_tokens": max_tokens,
                                "temperature": 0.5,
                            }
                        )
                        gemini_duration = time.time() - gemini_start
                        print(f"⏱️ Gemini synthesis took {gemini_duration:.2f}s")
                        
                        synthesized_response = response.text
                        
                        # Append disclaimer if present
                        if disclaimer_text and disclaimer_text not in synthesized_response:
                            synthesized_response = f"{synthesized_response}\n\n---\n\n{disclaimer_text}"
                        
                        # Track usage for cost monitoring (Gemini pricing)
                        # Gemini 2.0 Flash: $0.075 per 1M input tokens, $0.30 per 1M output tokens
                        input_tokens = len(synthesis_prompt.split()) * 1.3  # Rough estimate (words to tokens)
                        output_tokens = len(synthesized_response.split()) * 1.3
                        total_tokens = input_tokens + output_tokens
                        
                        print(f"✅ Gemini synthesis successful: {len(synthesized_response)} characters")
                        print(f"📊 Estimated token usage: {int(input_tokens)} input + {int(output_tokens)} output = {int(total_tokens)} total")
                        print(f"💰 Estimated cost: ${(input_tokens * 0.075 + output_tokens * 0.30) / 1_000_000:.6f}")
                        
                        synthesis_method = f"gemini_{selected_model.replace('-', '_')}"
                        
                        return {
                            "synthesis_response": {
                                "response": synthesized_response,
                                "sources": [
                                    "JIRA API",
                                    "Confluence API", 
                                    "GitHub API",
                                    "Document360 API"
                                ],
                                "synthesis_method": synthesis_method,
                                "model_used": selected_model,
                                "provider": "gemini",
                                "token_usage": {
                                    "input_tokens": int(input_tokens),
                                    "output_tokens": int(output_tokens),
                                    "total_tokens": int(total_tokens)
                                }
                            }
                        }
                    except Exception as e:
                        print(f"❌ Gemini API error: {e}")
                        import traceback
                        print(f"❌ Traceback: {traceback.format_exc()}")
                        # Fallback to OpenAI
                        print("⚠️ Falling back to OpenAI GPT-4o")
                        provider = "openai"
                        selected_model = "gpt-4o"
            
            # Use OpenAI (default or fallback)
            openai_start = time.time()
            client = openai.OpenAI(api_key=api_key, timeout=60.0)  # Increased to 60 seconds for workflow questions
            
            # Use GPT instructions as system message for better adherence
            system_message = "You are a helpful assistant for PulsePoint employees."
            if gpt_instructions and gpt_instructions.strip():
                system_message = gpt_instructions.strip()
            
            # Build messages array with conversation history
            messages = [{"role": "system", "content": system_message}]
            
            # Add conversation history if available
            if conversation_history and len(conversation_history) > 0:
                # Include last 5 messages for context (avoid token bloat)
                for msg in conversation_history[-5:]:
                    role = msg.get('role', 'user')
                    content = msg.get('content', '')
                    # Map roles: 'assistant' -> 'assistant', 'user' -> 'user'
                    if role in ['user', 'assistant']:
                        messages.append({"role": role, "content": content})
            
            # Add current question
            messages.append({"role": "user", "content": synthesis_prompt})
            
            response = client.chat.completions.create(
                model=selected_model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=0.5   # Reduced from 0.7 for more focused responses
            )
            openai_duration = time.time() - openai_start
            print(f"⏱️ OpenAI synthesis took {openai_duration:.2f}s")
            
            synthesized_response = response.choices[0].message.content
            
            # Append disclaimer if present
            if disclaimer_text and disclaimer_text not in synthesized_response:
                synthesized_response = f"{synthesized_response}\n\n---\n\n{disclaimer_text}"
            
            # Track usage for cost monitoring
            usage = response.usage
            input_tokens = usage.prompt_tokens if usage else 0
            output_tokens = usage.completion_tokens if usage else 0
            total_tokens = usage.total_tokens if usage else 0
            
            total_synthesis_duration = time.time() - synthesis_start_time
            print(f"✅ {provider.upper()} synthesis successful: {len(synthesized_response)} characters (total: {total_synthesis_duration:.2f}s)")
            print(f"📊 Token usage: {input_tokens} input + {output_tokens} output = {total_tokens} total")
            
            # Calculate cost based on model
            if selected_model == 'gpt-4o-mini':
                cost = (input_tokens * 0.15 + output_tokens * 0.60) / 1_000_000
            elif selected_model == 'gpt-4o':
                cost = (input_tokens * 2.50 + output_tokens * 10.00) / 1_000_000
            else:
                cost = (input_tokens * 2.50 + output_tokens * 10.00) / 1_000_000  # Default to GPT-4o pricing
            
            print(f"💰 Estimated cost: ${cost:.6f}")
            
            synthesis_method = f"{provider}_{selected_model.replace('-', '_')}"
            
            return {
                "synthesis_response": {
                    "response": synthesized_response,
                    "sources": [
                        "JIRA API",
                        "Confluence API", 
                        "GitHub API",
                        "Document360 API"
                    ],
                    "synthesis_method": synthesis_method,
                    "model_used": selected_model,
                    "provider": provider,
                    "token_usage": {
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "total_tokens": total_tokens
                    },
                    "duration_seconds": total_synthesis_duration
                }
            }
        except openai.APITimeoutError as e:
            print(f"❌ OpenAI API timeout: {e}")
            import traceback
            print(f"❌ Traceback: {traceback.format_exc()}")
            # Return a fallback response with the data we have
            return _generate_fallback_response(question, jira_data, confluence_data, github_data, document360_data, jql_link)
        except openai.AuthenticationError as e:
            print(f"❌ OpenAI Authentication error: {e}")
            import traceback
            print(f"❌ Traceback: {traceback.format_exc()}")
            return _generate_fallback_response(question, jira_data, confluence_data, github_data, document360_data, jql_link)
        except Exception as e:
            print(f"❌ OpenAI API error: {e}")
            import traceback
            print(f"❌ Traceback: {traceback.format_exc()}")
            print(f"❌ Error type: {type(e).__name__}")
            # Return a fallback response with the data we have
            return _generate_fallback_response(question, jira_data, confluence_data, github_data, document360_data, jql_link)
        
    except Exception as e:
        print(f"❌ Synthesis error: {e}")
        return {
            "synthesis_response": {
                "response": f"Error in synthesis: {str(e)}",
                "sources": [],
                "synthesis_method": "error"
            }
        }

def _generate_fallback_response(question: str, jira_data: dict, confluence_data: dict, github_data: dict, document360_data: dict, jql_link: str = None) -> dict:
    """Generate a fallback response when OpenAI times out or fails"""
    response_parts = []
    
    # Add JIRA data if available
    if jira_data.get('tickets') and len(jira_data['tickets']) > 0:
        response_parts.append(f"Found {len(jira_data['tickets'])} JIRA tickets.")
        if jira_data.get('summary'):
            response_parts.append("\nSummary:")
            for item in jira_data['summary'][:5]:
                response_parts.append(f"- {item}")
    
    # Add Confluence data if available
    if confluence_data.get('results') and len(confluence_data['results']) > 0:
        response_parts.append(f"\nFound {len(confluence_data['results'])} Confluence pages:")
        for page in confluence_data['results'][:3]:
            title = page.get('title', 'No title')
            url = page.get('confluence_url', page.get('source_url', '#'))
            response_parts.append(f"- [{title}]({url})")
    
    # Add sources
    sources = []
    if jira_data.get('tickets'):
        if jql_link:
            sources.append(jql_link)
        else:
            sources.append("JIRA API")
    if confluence_data.get('results'):
        sources.append("Confluence API")
    if github_data.get('repositories'):
        sources.append("GitHub API")
    if document360_data.get('articles'):
        sources.append("Document360 API")
    
    fallback_response = "\n".join(response_parts) if response_parts else "No data available for this query."
    
    return {
        "synthesis_response": {
            "response": fallback_response,
            "sources": sources,
            "synthesis_method": "fallback"
        }
    }

@app.route('/', methods=['GET'])
def health_check():
    """Health check endpoint with API key status"""
    # Check OpenAI API key status for debugging
    api_key_status = {
        "env_var": "SET" if os.getenv("OPENAI_API_KEY") else "NOT SET",
        "env_var_length": len(os.getenv("OPENAI_API_KEY", "")),
        "openai_api_key_set": "SET" if hasattr(openai, 'api_key') and openai.api_key else "NOT SET",
        "openai_available": OPENAI_AVAILABLE,
        "secret_manager_available": SECRET_MANAGER_AVAILABLE,
        "cache_set": "SET" if OPENAI_API_KEY_CACHE else "NOT SET"
    }
    
    # Try to get key using our function
    try:
        test_key = _get_openai_api_key()
        api_key_status["_get_openai_api_key_result"] = "SUCCESS" if test_key else "FAILED"
        api_key_status["retrieved_key_length"] = len(test_key) if test_key else 0
        if test_key:
            api_key_status["key_preview"] = f"{test_key[:7]}...{test_key[-4:]}" if len(test_key) > 11 else "SHORT"
    except Exception as e:
        api_key_status["_get_openai_api_key_error"] = str(e)
        import traceback
        api_key_status["_get_openai_api_key_traceback"] = traceback.format_exc()
    
    return jsonify({
        "version": "5.0-FIXED-DATA-SOURCES",
        "message": "Knowledge Layer v5 - Fixed Data Source Integration + Intelligent Synthesis",
        "status": "healthy",
        "synthesis_type": "openai_powered_multi_source_synthesis",
        "openai_api_key_status": api_key_status,
        "features": [
            "CRITICAL FIX: All data sources now use actual search instead of hardcoded responses",
            "CRITICAL FIX: Confluence API - POST with JSON body to /search endpoint",
            "CRITICAL FIX: Document360 API - GET with query parameters",
            "CRITICAL FIX: GitHub API - POST with question parameter",
            "CRITICAL FIX: JIRA API - Intelligent parameter extraction",
            "ENHANCED: Intelligent keyword extraction for complex questions",
            "ENHANCED: Comparison question handling (e.g., 'What is the difference between X and Y')",
            "ENHANCED: Better search query generation using extracted keywords",
            "ENHANCED: OpenAI-powered synthesis combining all data sources",
            "ENHANCED: Proper source attribution and clickable links",
            "ENHANCED: Session management and conversation history",
            "ENHANCED: Dynamic date detection and response optimization",
            "ENHANCED: JQL links with actual issue IDs",
            "ENHANCED: Hybrid model selection (GPT-4o-mini for simple, GPT-4o for complex queries)"
        ]
    })

@app.route('/ask', methods=['GET', 'POST', 'OPTIONS'])
@cross_origin()
def knowledge_orchestrator_v5():
    """Knowledge Layer v5 - FIXED DATA SOURCE INTEGRATION + INTELLIGENT SYNTHESIS"""
    from flask import request as flask_request
    request = flask_request

    try:
        # Handle GET request (health check + debug)
        if request.method == 'GET':
            # Check OpenAI API key status for debugging
            api_key_status = {
                "env_var": "SET" if os.getenv("OPENAI_API_KEY") else "NOT SET",
                "env_var_length": len(os.getenv("OPENAI_API_KEY", "")),
                "openai_api_key_set": "SET" if hasattr(openai, 'api_key') and openai.api_key else "NOT SET",
                "openai_available": OPENAI_AVAILABLE,
                "secret_manager_available": SECRET_MANAGER_AVAILABLE,
                "cache_set": "SET" if OPENAI_API_KEY_CACHE else "NOT SET"
            }
            
            # Try to get key using our function
            try:
                test_key = _get_openai_api_key()
                api_key_status["_get_openai_api_key_result"] = "SUCCESS" if test_key else "FAILED"
                api_key_status["retrieved_key_length"] = len(test_key) if test_key else 0
            except Exception as e:
                api_key_status["_get_openai_api_key_error"] = str(e)
            
            return jsonify({
                "version": "5.0-FIXED-DATA-SOURCES",
                "message": "Knowledge Layer v5 - Fixed Data Source Integration + Intelligent Synthesis",
                "status": "healthy",
                "synthesis_type": "openai_powered_multi_source_synthesis",
                "openai_api_key_status": api_key_status,
                "features": [
                    "CRITICAL FIX: All data sources now use actual search instead of hardcoded responses",
                    "CRITICAL FIX: Confluence API - POST with JSON body to /search endpoint",
                    "CRITICAL FIX: Document360 API - GET with query parameters",
                    "CRITICAL FIX: GitHub API - POST with question parameter",
                    "CRITICAL FIX: JIRA API - Intelligent parameter extraction",
                    "ENHANCED: Intelligent keyword extraction for complex questions",
                    "ENHANCED: Comparison question handling (e.g., 'What is the difference between X and Y')",
                    "ENHANCED: Better search query generation using extracted keywords",
                    "ENHANCED: OpenAI-powered synthesis combining all data sources",
                    "ENHANCED: Proper source attribution and clickable links",
                    "ENHANCED: Session management and conversation history",
                    "ENHANCED: Dynamic date detection and response optimization",
                    "ENHANCED: JQL links with actual issue IDs"
                ]
            })

        # Handle POST request
        if request.method != 'POST':
            return jsonify({"error": "Method not allowed"}), 405

        request_data = request.get_json()
        if not request_data:
            return jsonify({"error": "No JSON data provided"}), 400

        question = request_data.get('question')
        if not question:
            return jsonify({"error": "No question provided"}), 400

        # Enhanced session management
        session_id = request_data.get('session_id', generate_session_id(question))
        conversation_history = request_data.get('conversation_history', [])
        max_results = request_data.get('max_results', 100)  # Increased default from 50 to 100
        model_preference = request_data.get('model_preference')  # User's model preference (optional)

        print(f"🤖 v5 Query: {question}")
        print(f"🔄 Session ID: {session_id}")
        print(f"📜 Conversation History: {len(conversation_history)} messages")
        if model_preference:
            print(f"🎯 User model preference: {model_preference} (type: {type(model_preference)})")
        else:
            print(f"🎯 No model preference - will use auto-selection")

        # Intelligent query analysis with enhanced keyword extraction
        query_analysis = intelligent_query_analysis(question)
        print(f"🧠 Intelligent analysis: {query_analysis.get('intent', 'general')}")
        print(f"📅 Date extracted: {query_analysis.get('jira_params', {}).get('sprint_date', 'Not found')}")
        print(f"🔍 Keywords extracted: {query_analysis.get('keywords', [])}")

        # Load GPT context files FIRST (always, for all queries)
        gpt_context = load_gpt_context_files()
        
        # Get data sources based on query intent
        detected_intent = query_analysis.get('intent', 'general')
        print(f"🔍 Query intent: {detected_intent}")
        
        confluence_data = {}
        github_data = {}
        document360_data = {}
        
        if detected_intent == 'jira_only':
            print("🔍 JIRA-only query - skipping other data sources")
            confluence_data = {'results': [], 'api_success': False, 'total_sources_found': 0}
            github_data = {'repositories': [], 'api_success': False, 'total_repos_found': 0}
            document360_data = {'articles': [], 'api_success': False, 'total_articles_found': 0}
        elif detected_intent == 'aggregation':
            print("🔍 Aggregation query - JIRA-only for counts and sums")
            confluence_data = {'results': [], 'api_success': False, 'total_sources_found': 0}
            github_data = {'repositories': [], 'api_success': False, 'total_repos_found': 0}
            document360_data = {'articles': [], 'api_success': False, 'total_articles_found': 0}
        elif detected_intent == 'workflow':
            print("🔍 Workflow query - prioritizing Confluence + GitHub, skipping Document360 (internal process)")
            # For workflow questions: Prioritize Confluence + GitHub, skip Document360
            with ThreadPoolExecutor(max_workers=6) as executor:  # Increased from 4 to 6 for better parallelism
                confluence_future = executor.submit(call_confluence_api, question, query_analysis, conversation_history)
                github_future = executor.submit(call_github_api, question, query_analysis)
                product_mappings_future = executor.submit(get_product_mappings_from_github)
                # Skip Document360 for workflow/internal process questions
                document360_data = {'articles': [], 'api_success': False, 'total_articles_found': 0}
                
                # Get product mappings first (needed for JIRA)
                try:
                    product_mappings = product_mappings_future.result(timeout=10)
                except Exception as e:
                    print(f"⚠️ Product mappings timeout/error: {e}")
                    product_mappings = {}
                
                # JIRA call for context (but not primary source for workflow questions)
                # For workflow queries, filter JIRA tickets by the main subject (e.g., PRTS)
                # Extract the main subject from the question to filter tickets
                workflow_subject = None
                import re
                # Pattern: "workflow of X" or "workflow of the X" or "what is X the process" or "describe X the process"
                patterns = [
                    r'workflow\s+of\s+(?:the\s+)?([A-Z]+)',  # "workflow of PRTS"
                    r'what\s+is\s+([A-Z]+)\s+the\s+process',  # "what is PRTS the process"
                    r'describe\s+([A-Z]+)\s+the\s+process',  # "describe PRTS the process"
                    r'explain\s+([A-Z]+)\s+the\s+process',  # "explain PRTS the process"
                    r'(?:what|how|explain|describe).*?([A-Z]{2,})',  # Fallback: extract any uppercase acronym
                ]
                for pattern in patterns:
                    match = re.search(pattern, question, re.IGNORECASE)
                    if match:
                        workflow_subject = match.group(1)
                        break  # Extract the acronym (e.g., "PRTS")
                else:
                    # Pattern: "how does X work" or "explain X"
                    match = re.search(r'(?:how\s+does|explain|describe|tell\s+me\s+about)\s+([A-Z]+)', question, re.IGNORECASE)
                    if match:
                        workflow_subject = match.group(1)
                    elif query_analysis.get('keywords'):
                        # Use the first keyword that looks like an acronym/product name
                        keywords = query_analysis['keywords']
                        for kw in keywords:
                            if len(kw) >= 2 and kw.isupper():
                                workflow_subject = kw
                                break
                
                # If we found a workflow subject, add it to query_analysis for JIRA filtering
                if workflow_subject and query_analysis:
                    if 'jira_params' not in query_analysis:
                        query_analysis['jira_params'] = {}
                    # Add search terms to filter JIRA tickets by the workflow subject
                    query_analysis['jira_params']['search_terms'] = workflow_subject
                    query_analysis['jira_params']['summary'] = workflow_subject  # Also search in summary field
                    print(f"🔍 Workflow query detected subject: {workflow_subject} - filtering JIRA tickets")
                
                jira_future = executor.submit(call_jira_v4_api, question, max_results, query_analysis, product_mappings)
                
                # Wait for Confluence and GitHub (primary sources) - increased timeouts
                try:
                    confluence_data = confluence_future.result(timeout=30)  # Increased from 15 to 30 seconds
                except Exception as e:
                    print(f"⚠️ Confluence API timeout/error: {e}")
                    confluence_data = {'results': [], 'api_success': False, 'total_sources_found': 0}
                
                try:
                    github_data = github_future.result(timeout=30)  # Increased from 15 to 30 seconds
                except Exception as e:
                    print(f"⚠️ GitHub API timeout/error: {e}")
                    github_data = {'repositories': [], 'api_success': False, 'total_repos_found': 0}
                
                # Get JIRA data (for context, but not primary) - increased timeout
                try:
                    jira_data = jira_future.result(timeout=40)  # Increased from 20 to 40 seconds
                    print(f"✅ JIRA data retrieved: {len(jira_data.get('tickets', []))} tickets")
                except Exception as e:
                    print(f"⚠️ JIRA API timeout/error: {e}")
                    jira_data = {'tickets': [], 'api_success': False, 'total_tickets_found': 0}
                
                # Skip to synthesis for workflow queries (already have all data)
                # Create JQL link ONLY if we have PRTS-related tickets (filter out unrelated tickets)
                jql_link = ''
                if jira_data.get('tickets'):
                    # Filter tickets to only include those related to the workflow subject
                    if workflow_subject:
                        filtered_tickets = [
                            ticket for ticket in jira_data.get('tickets', [])
                            if workflow_subject.upper() in ticket.get('summary', '').upper() or 
                               workflow_subject.upper() in ticket.get('issue_key', '')
                        ]
                        if filtered_tickets:
                            jql_link = create_jql_link_with_issue_ids(filtered_tickets)
                            print(f"🔍 Filtered JIRA tickets: {len(filtered_tickets)} PRTS-related tickets out of {len(jira_data.get('tickets', []))} total")
                        else:
                            print(f"⚠️ No PRTS-related tickets found in {len(jira_data.get('tickets', []))} tickets - not creating JQL link")
                    else:
                        # No workflow subject detected, use all tickets
                        jql_link = create_jql_link_with_issue_ids(jira_data.get('tickets', []))
                
                # Filter JIRA tickets BEFORE synthesis for workflow queries
                # This ensures Gemini/OpenAI only see relevant tickets
                filtered_jira_data = jira_data.copy()
                if workflow_subject and jira_data.get('tickets'):
                    filtered_tickets = [
                        ticket for ticket in jira_data.get('tickets', [])
                        if workflow_subject.upper() in ticket.get('summary', '').upper() or 
                           workflow_subject.upper() in ticket.get('issue_key', '')
                    ]
                    filtered_jira_data['tickets'] = filtered_tickets
                    print(f"🔍 Filtered JIRA tickets for synthesis: {len(filtered_tickets)} {workflow_subject}-related tickets out of {len(jira_data.get('tickets', []))} total")
                else:
                    filtered_jira_data = jira_data
                
                print(f"🔍 Workflow query - calling synthesis with:")
                print(f"  - Confluence: {len(confluence_data.get('results', []))} pages")
                print(f"  - GitHub: {len(github_data.get('repositories', []))} repos")
                print(f"  - JIRA: {len(filtered_jira_data.get('tickets', []))} tickets (filtered for {workflow_subject if workflow_subject else 'all'})")
                print(f"  - OpenAI available: {OPENAI_AVAILABLE}")
                
                synthesis_result = synthesize_with_openai(
                    question, filtered_jira_data, confluence_data, github_data, document360_data, 
                    conversation_history, jql_link, gpt_context, detected_intent, model_preference
                )
                
                print(f"✅ Synthesis result method: {synthesis_result.get('synthesis_response', {}).get('synthesis_method', 'unknown')}")
                
                # Extract full synthesis_response to preserve model_used and provider
                synthesis_response = synthesis_result.get("synthesis_response", {})
                return jsonify({
                    "response": synthesis_response.get("response", "No response generated"),
                    "sources": synthesis_response.get("sources", []),
                    "jql_link": jql_link,
                    "confluence_results": len(confluence_data.get('results', [])),
                    "github_repos": len(github_data.get('repositories', [])),
                    "jira_tickets": len(jira_data.get('tickets', [])),
                    "document360_articles": 0,  # Skipped for workflow queries
                    "query_intent": detected_intent,
                    "synthesis_method": synthesis_response.get("synthesis_method", "unknown"),
                    "model_used": synthesis_response.get("model_used", "unknown"),  # Include model_used
                    "provider": synthesis_response.get("provider", "unknown"),  # Include provider
                    "token_usage": synthesis_response.get("token_usage", {}),  # Include token_usage
                    "synthesis_response": synthesis_response  # Include full synthesis_response for backend
                })
        else:
            print("🔍 General query - calling all data sources concurrently...")
            # Make API calls concurrently for faster response
            with ThreadPoolExecutor(max_workers=8) as executor:  # Increased from 5 to 8 for better parallelism
                # Submit all API calls concurrently
                confluence_future = executor.submit(call_confluence_api, question, query_analysis, conversation_history)
                github_future = executor.submit(call_github_api, question, query_analysis)
                document360_future = executor.submit(call_document360_api, question, query_analysis)
                product_mappings_future = executor.submit(get_product_mappings_from_github)
                
                # Get product mappings first (needed for JIRA), but don't block others
                try:
                    product_mappings = product_mappings_future.result(timeout=10)
                except Exception as e:
                    print(f"⚠️ Product mappings timeout/error: {e}")
                    product_mappings = {}
                
                # Start JIRA call once we have product_mappings (or empty dict)
                jira_future = executor.submit(call_jira_v4_api, question, max_results, query_analysis, product_mappings)
                
                # Wait for all to complete (with increased timeout for more data)
                try:
                    confluence_data = confluence_future.result(timeout=30)  # Increased from 15 to 30 seconds
                except Exception as e:
                    print(f"⚠️ Confluence API timeout/error: {e}")
                    confluence_data = {'results': [], 'api_success': False, 'total_sources_found': 0}
                
                try:
                    github_data = github_future.result(timeout=30)  # Increased from 15 to 30 seconds
                except Exception as e:
                    print(f"⚠️ GitHub API timeout/error: {e}")
                    github_data = {'repositories': [], 'api_success': False, 'total_repos_found': 0}
                
                try:
                    document360_data = document360_future.result(timeout=30)  # Increased from 15 to 30 seconds
                except Exception as e:
                    print(f"⚠️ Document360 API timeout/error: {e}")
                    document360_data = {'articles': [], 'api_success': False, 'total_articles_found': 0}
                
                # Wait for JIRA (with increased timeout)
                try:
                    jira_data = jira_future.result(timeout=40)  # Increased from 20 to 40 seconds
                except Exception as e:
                    print(f"⚠️ JIRA API timeout/error: {e}")
                    jira_data = {'tickets': [], 'summary': [], 'query_success': False, 'total_tickets': 0}
        
        # For jira_only and aggregation queries, still need to call JIRA
        if detected_intent in ['jira_only', 'aggregation']:
            # Get product mappings for JIRA filtering
            product_mappings = get_product_mappings_from_github()
            jira_data = call_jira_v4_api(question, max_results, query_analysis, product_mappings)

        if not jira_data:
            return jsonify({
                "error": "Failed to retrieve JIRA data",
                "session_id": session_id,
                "version": "5.0-FIXED-DATA-SOURCES"
            }), 500

        # Process JIRA response
        tickets = jira_data.get('tickets', [])
        summary_data = jira_data.get('summary', [])

        # Create JQL link with issue IDs
        jql_link = create_jql_link_with_issue_ids(tickets)

        # Synthesize response with OpenAI (include GPT context and query intent)
        synthesis_result = synthesize_with_openai(
            question, jira_data, confluence_data, github_data, document360_data,
            conversation_history, jql_link, gpt_context, detected_intent, model_preference
        )

        # Build sources list
        sources = []
        if jql_link:
            sources.append(jql_link)

        # Response already synthesized above, use it
        print("🧠 Using synthesized response...")
        openai_response = synthesis_result

        # Add session management and API status to OpenAI response
        if "synthesis_response" in openai_response:
            openai_response["synthesis_response"]["session_id"] = session_id
            openai_response["synthesis_response"]["version"] = "5.0-FIXED-DATA-SOURCES"
            openai_response["synthesis_response"]["api_status"] = {
                "data_sources_queried": 4,
                "data_sources_successful": sum([
                    1 if jira_data.get('query_success', False) else 0,
                    1 if confluence_data.get('api_success', False) else 0,
                    1 if github_data.get('api_success', False) else 0,
                    1 if document360_data.get('api_success', False) else 0
                ]),
                "jira_query_success": jira_data.get('query_success', False),
                "confluence_api_success": confluence_data.get('api_success', False),
                "github_api_success": github_data.get('api_success', False),
                "document360_api_success": document360_data.get('api_success', False),
                "confluence_sources": confluence_data["total_sources_found"],
                "github_repos": github_data["total_repos_found"],
                "document360_articles": document360_data["total_articles_found"]
            }

        print(f"✅ v5 Response completed with OpenAI synthesis: {len(tickets)} JIRA tickets, {confluence_data['total_sources_found']} Confluence pages")
        return jsonify(openai_response)

    except Exception as e:
        print(f"❌ v5 Error: {e}")
        return jsonify({
            "error": f"Internal server error: {str(e)}",
            "version": "5.0-FIXED-DATA-SOURCES",
            "timestamp": datetime.now().isoformat()
        }), 500

# === CLOUD FUNCTION GEN2 ENTRY POINT ===
# This allows deployment as Cloud Function gen2 (shows as "Cloud Run functions" deployer)
# Only available if functions_framework is installed
if FUNCTIONS_FRAMEWORK_AVAILABLE:
    @functions_framework.http
    def knowledge_layer_v5(request):
        """
        Cloud Function gen2 HTTP entry point for Flask app
        Converts Cloud Functions request to Flask request context
        """
        with app.test_request_context(
            path=request.path,
            method=request.method,
            headers=dict(request.headers),
            data=request.get_data(),
            query_string=request.query_string
        ):
            try:
                response = app.full_dispatch_request()
                return (
                    response.get_data(),
                    response.status_code,
                    dict(response.headers)
                )
            except Exception as e:
                import traceback
                error_msg = f"Error: {str(e)}\n{traceback.format_exc()}"
                print(f"❌ Error in knowledge_layer_v5: {error_msg}")
                return (
                    json.dumps({"error": str(e), "type": type(e).__name__}),
                    500,
                    {"Content-Type": "application/json"}
                )
else:
    # Cloud Run only - no functions_framework wrapper needed
    def knowledge_layer_v5(request):
        """Placeholder for Cloud Run deployment (not used)"""
        pass

# For Cloud Run direct deployment (legacy - kept for compatibility)
if __name__ == '__main__':
    # In production (Cloud Run), use gunicorn with proper timeout
    # In development, use Flask's built-in server
    if os.environ.get('GAE_ENV') or os.environ.get('K_SERVICE'):
        # Cloud Run environment - use gunicorn
        import gunicorn.app.base
        from gunicorn import util
        
        class StandaloneApplication(gunicorn.app.base.BaseApplication):
            def __init__(self, app, options=None):
                self.options = options or {}
                self.application = app
                super().__init__()
            
            def load_config(self):
                for key, value in self.options.items():
                    self.cfg.set(key.lower(), value)
            
            def load(self):
                return self.application
        
        options = {
            'bind': f"0.0.0.0:{os.environ.get('PORT', 8080)}",
            'workers': 2,
            'timeout': 120,
            'worker_class': 'sync',
            'keepalive': 5,
        }
        StandaloneApplication(app, options).run()
    else:
        # Local development
        app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)), debug=False)
