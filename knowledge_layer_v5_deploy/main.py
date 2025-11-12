import json
import os
import requests
from datetime import datetime, timedelta
from flask import Request, jsonify, Flask
from flask_cors import CORS, cross_origin
import functions_framework
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

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
try:
    import openai
    # Get API key from environment variable (set in Cloud Run)
    openai.api_key = os.getenv("OPENAI_API_KEY")
    if not openai.api_key:
        print("⚠️ OPENAI_API_KEY environment variable not set")
        OPENAI_AVAILABLE = False
    else:
        OPENAI_AVAILABLE = True
        print("✅ OpenAI initialized successfully with GPT-4o-mini")
except ImportError as e:
    print(f"⚠️ OpenAI not available: {e}")
    OPENAI_AVAILABLE = False
except Exception as e:
    print(f"⚠️ OpenAI initialization error: {e}")
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

def _http_get_json(url: str, params: dict = None, headers: dict = None, timeout: int = 15):
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

def _http_post_json(url: str, data: dict, headers: dict = None, timeout: int = 15):
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

def intelligent_query_analysis(question: str) -> dict:
    """
    Enhanced intelligent query analysis with better keyword extraction
    Bryan's requirement: Extract meaningful keywords and detect query intent
    """
    question_lower = question.lower()
    
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
    
    # Limit to most relevant keywords
    keywords = keywords[:5]
    
    # Detect query intent
    intent = "general"
    if any(word in question_lower for word in ['ticket', 'tickets', 'issue', 'issues', 'story', 'stories', 'epic', 'epics', 'bug', 'bugs', 'task', 'tasks']):
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

def call_jira_v4_api(question: str, max_results: int = 50, query_analysis: dict = None, product_mappings: dict = None) -> dict:
    """
    Call JIRA v4 API with intelligent parameter extraction
    Bryan's requirement: Use actual search parameters, not hardcoded responses
    """
    try:
        # For roadmap/stream queries, increase max_results to capture all relevant tickets
        if any(word in question.lower() for word in ['roadmap', 'latest', 'omnichannel', 'stream', 'planned', 'rest of', 'remainder']):
            max_results = max(max_results, 200)  # Ensure we get at least 200 results for comprehensive roadmaps
        
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
        
        response = _http_post_json(JIRA_V4_API, params)
        
        if response:
            print(f"✅ JIRA v4 API success: {len(response.get('tickets', []))} tickets")
            return {
                'tickets': response.get('tickets', []),
                'summary': response.get('summary', []),
                'query_success': True,
                'total_tickets': len(response.get('tickets', [])),
                'api_response': response
            }
        else:
            print("❌ JIRA v4 API failed")
            return {
                'tickets': [],
                'summary': [],
                'query_success': False,
                'total_tickets': 0,
                'api_response': None
            }
            
    except Exception as e:
        print(f"❌ JIRA v4 API error: {e}")
        return {
            'tickets': [],
            'summary': [],
            'query_success': False,
            'total_tickets': 0,
            'api_response': None
        }

def call_confluence_api(question: str, query_analysis: dict = None, conversation_history: list = None) -> dict:
    """
    Call Confluence API with intelligent search
    Bryan's requirement: Use actual search, not hardcoded responses
    """
    try:
        # Extract search terms from query analysis - use full query for better matching
        search_terms = question
        
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
        
        if query_analysis and query_analysis.get('keywords'):
            keywords = query_analysis['keywords']
            # For specific queries like "AO factors", use the full query
            if 'ao' in question.lower() and 'factor' in question.lower():
                search_terms = 'AO factors'
            elif 'ao' in question.lower():
                search_terms = 'AO'
            elif 'factor' in question.lower() and has_ao_context:
                # If just "factors" but we have AO context, search for "AO factors"
                search_terms = 'AO factors'
            elif 'omnichannel' in question.lower() or 'audience' in question.lower():
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
        payload = {
            "query": search_terms,
            "max_results": 10,
            "min_similarity": 0.01  # Use low threshold for reliable results
        }
        
        print(f"🔍 Confluence API call with payload: {payload}")
        
        response = _http_post_json(f"{CONFLUENCE_API}/search", payload)
        
        if response:
            results = response.get('results', [])
            print(f"✅ Confluence API success: {len(results)} pages")
            return {
                'results': results,
                'api_success': True,
                'total_sources_found': len(results),
                'search_terms': search_terms
            }
        else:
            print("❌ Confluence API failed")
            return {
                'results': [],
                'api_success': False,
                'total_sources_found': 0,
                'search_terms': search_terms
            }
            
    except Exception as e:
        print(f"❌ Confluence API error: {e}")
        return {
            'results': [],
            'api_success': False,
            'total_sources_found': 0,
            'search_terms': question
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

def synthesize_with_openai(question: str, jira_data: dict, confluence_data: dict, github_data: dict, document360_data: dict, conversation_history: list = None, jql_link: str = None) -> dict:
    """
    Synthesize comprehensive response using OpenAI
    Bryan's requirement: Intelligent synthesis combining all data sources
    """
    if not OPENAI_AVAILABLE:
        return {
            "synthesis_response": {
                "response": "OpenAI not available for synthesis",
                "sources": [],
                "synthesis_method": "fallback"
            }
        }
    
    try:
        # Build context from all data sources - ONLY include actual data
        context_parts = []
        
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
        if confluence_data.get('results') and len(confluence_data['results']) > 0:
            confluence_context = "Confluence Pages with Full Content:\n"
            for page in confluence_data['results'][:5]:  # Limit to 5 pages
                title = page.get('title', 'No title')
                url = page.get('confluence_url', page.get('source_url', '#'))
                content = page.get('content', 'No content available')
                confluence_context += f"- [{title}]({url})\n"
                confluence_context += f"  Content: {content[:1000]}...\n\n"  # Include first 1000 chars
            context_parts.append(confluence_context)
        else:
            context_parts.append("Confluence Data: No Confluence pages found for this query.")
        
        # Add GitHub context - ONLY if we have actual repositories
        if github_data.get('repositories') and len(github_data['repositories']) > 0:
            github_context = "GitHub Repositories with Details:\n"
            for repo in github_data['repositories'][:5]:  # Limit to 5 repos
                name = repo.get('repository_name', repo.get('name', 'No name'))
                url = repo.get('github_url', repo.get('url', '#'))
                description = repo.get('description', 'No description')
                language = repo.get('main_language', 'Unknown')
                github_context += f"- [{name}]({url})\n"
                github_context += f"  Description: {description}\n"
                github_context += f"  Language: {language}\n\n"
            context_parts.append(github_context)
        else:
            context_parts.append("GitHub Data: No GitHub repositories found for this query.")
        
        # Add Document360 context - ONLY if we have actual articles
        if document360_data.get('articles') and len(document360_data['articles']) > 0:
            doc360_context = "Document360 Articles with Content:\n"
            for article in document360_data['articles'][:5]:  # Limit to 5 articles
                title = article.get('title', 'No title')
                url = article.get('url', '#')
                content = article.get('content', article.get('summary', 'No content available'))
                doc360_context += f"- [{title}]({url})\n"
                doc360_context += f"  Content: {content[:500]}...\n\n"  # Include first 500 chars
            context_parts.append(doc360_context)
        else:
            context_parts.append("Document360 Data: No Document360 articles found for this query.")
        
        # Combine all context
        full_context = "\n\n".join(context_parts)
        
        # Create synthesis prompt
        synthesis_prompt = f"""
You are an AI assistant helping PulsePoint employees find information from internal systems.

Question: {question}

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

Respond professionally and helpfully, processing all available content to provide the most comprehensive and useful response possible.
"""
        
        # Call OpenAI API (v1.0+ compatible) with optimized parameters and timeout
        try:
            client = openai.OpenAI(api_key=openai.api_key, timeout=30.0)  # Increased to 30 seconds
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant for PulsePoint employees."},
                    {"role": "user", "content": synthesis_prompt}
                ],
                max_tokens=1000,  # Further reduced for faster response
                temperature=0.5   # Reduced from 0.7 for more focused responses
            )
            
            synthesized_response = response.choices[0].message.content
            
            return {
                "synthesis_response": {
                    "response": synthesized_response,
                    "sources": [
                        "JIRA API",
                        "Confluence API", 
                        "GitHub API",
                        "Document360 API"
                    ],
                    "synthesis_method": "openai_gpt4o_mini"
                }
            }
        except openai.APITimeoutError as e:
            print(f"❌ OpenAI API timeout: {e}")
            # Return a fallback response with the data we have
            return _generate_fallback_response(question, jira_data, confluence_data, github_data, document360_data, jql_link)
        except Exception as e:
            print(f"❌ OpenAI API error: {e}")
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
    """Health check endpoint"""
    return jsonify({
        "version": "5.0-FIXED-DATA-SOURCES",
        "message": "Knowledge Layer v5 - Fixed Data Source Integration + Intelligent Synthesis",
        "status": "healthy",
        "synthesis_type": "openai_powered_multi_source_synthesis",
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

@app.route('/ask', methods=['GET', 'POST', 'OPTIONS'])
@cross_origin()
def knowledge_orchestrator_v5():
    """Knowledge Layer v5 - FIXED DATA SOURCE INTEGRATION + INTELLIGENT SYNTHESIS"""
    from flask import request as flask_request
    request = flask_request

    try:
        # Handle GET request (health check + debug)
        if request.method == 'GET':
            return jsonify({
                "version": "5.0-FIXED-DATA-SOURCES",
                "message": "Knowledge Layer v5 - Fixed Data Source Integration + Intelligent Synthesis",
                "status": "healthy",
                "synthesis_type": "openai_powered_multi_source_synthesis",
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
        max_results = request_data.get('max_results', 50)

        print(f"🤖 v5 Query: {question}")
        print(f"🔄 Session ID: {session_id}")
        print(f"📜 Conversation History: {len(conversation_history)} messages")

        # Intelligent query analysis with enhanced keyword extraction
        query_analysis = intelligent_query_analysis(question)
        print(f"🧠 Intelligent analysis: {query_analysis.get('intent', 'general')}")
        print(f"📅 Date extracted: {query_analysis.get('jira_params', {}).get('sprint_date', 'Not found')}")
        print(f"🔍 Keywords extracted: {query_analysis.get('keywords', [])}")

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
        else:
            print("🔍 General query - calling all data sources concurrently...")
            # Make API calls concurrently for faster response
            with ThreadPoolExecutor(max_workers=5) as executor:
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
                
                # Wait for all to complete (with timeout)
                try:
                    confluence_data = confluence_future.result(timeout=15)
                except Exception as e:
                    print(f"⚠️ Confluence API timeout/error: {e}")
                    confluence_data = {'results': [], 'api_success': False, 'total_sources_found': 0}
                
                try:
                    github_data = github_future.result(timeout=15)
                except Exception as e:
                    print(f"⚠️ GitHub API timeout/error: {e}")
                    github_data = {'repositories': [], 'api_success': False, 'total_repos_found': 0}
                
                try:
                    document360_data = document360_future.result(timeout=15)
                except Exception as e:
                    print(f"⚠️ Document360 API timeout/error: {e}")
                    document360_data = {'articles': [], 'api_success': False, 'total_articles_found': 0}
                
                # Wait for JIRA (with timeout)
                try:
                    jira_data = jira_future.result(timeout=20)
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

        # Build sources list
        sources = []
        if jql_link:
            sources.append(jql_link)

        # Synthesize comprehensive response using OpenAI
        print("🧠 Synthesizing response with OpenAI...")
        openai_response = synthesize_with_openai(
            question, 
            jira_data, 
            confluence_data, 
            github_data, 
            document360_data,
            conversation_history=conversation_history,
            jql_link=jql_link
        )

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
