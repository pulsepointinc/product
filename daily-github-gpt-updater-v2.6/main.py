import functions_framework
from google.cloud import bigquery, secretmanager
import requests
import json
import base64
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize clients
bq_client = bigquery.Client()
secret_client = secretmanager.SecretManagerServiceClient()

# Constants
GITHUB_REPO = "pulsepointinc/product"
GITHUB_PATH = "GPT"
PROJECT_ID = "pulsepoint-datahub"

def get_secret(secret_name):
    """Retrieve secret from Google Secret Manager"""
    name = f"projects/{PROJECT_ID}/secrets/{secret_name}/versions/latest"
    response = secret_client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8").strip()

def get_github_file_sha(filename, github_token):
    """Get the SHA of existing GitHub file (needed for updates)"""
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_PATH}/{filename}"
        headers = {
            "Authorization": f"token {github_token}",
            "Accept": "application/vnd.github.v3+json"
        }

        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            file_data = response.json()
            sha = file_data.get('sha')
            logger.info(f"SHA for {filename}: {sha}")
            return sha
        else:
            logger.warning(f"File {filename} error: {response.status_code}")
            return None
    except Exception as e:
        logger.warning(f"Could not get SHA for {filename}: {str(e)}")
        return None

def update_github_file(filename, content, github_token):
    """Update file in GitHub repository"""
    try:
        logger.info(f"=== UPDATING {filename} ===")
        
        # Get SHA
        sha = get_github_file_sha(filename, github_token)
        
        # Prepare content
        new_content_str = json.dumps(content, indent=2)
        content_encoded = base64.b64encode(new_content_str.encode()).decode()
        
        # Prepare update data
        url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_PATH}/{filename}"
        headers = {
            "Authorization": f"token {github_token}",
            "Accept": "application/vnd.github.v3+json"
        }
        
        data = {
            "message": f"Update {filename} via daily-github-gpt-updater-v2.5",
            "content": content_encoded,
            "branch": "main"
        }
        
        if sha:
            data["sha"] = sha
        
        # Send update request
        response = requests.put(url, headers=headers, json=data)
        logger.info(f"GitHub API response for {filename}: {response.status_code}")
        
        if response.status_code in [200, 201]:
            response_data = response.json()
            commit_sha = response_data.get('commit', {}).get('sha', 'unknown')
            logger.info(f"✅ SUCCESS: Updated {filename} - commit SHA: {commit_sha}")
            return True
        else:
            logger.error(f"❌ FAILED: {filename} - {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"❌ EXCEPTION: {filename} - {str(e)}")
        return False

def get_confluence_page_content(page_id, confluence_token, confluence_username):
    """Fetch content from Confluence page"""
    try:
        url = f"https://ppinc.atlassian.net/wiki/rest/api/content/{page_id}"
        auth_string = f"{confluence_username}:{confluence_token}"
        auth_bytes = base64.b64encode(auth_string.encode()).decode()
        
        headers = {
            "Authorization": f"Basic {auth_bytes}",
            "Accept": "application/json"
        }
        
        params = {"expand": "body.storage,body.view"}
        
        logger.info(f"Fetching Confluence page {page_id}")
        response = requests.get(url, headers=headers, params=params)
        logger.info(f"Confluence API response: {response.status_code}")
        
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"Confluence API failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        logger.error(f"Error fetching Confluence page {page_id}: {str(e)}")
        return None

def extract_acronyms_from_confluence(page_content):
    """Extract acronyms from Confluence page content"""
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(page_content.get('body', {}).get('storage', {}).get('value', ''), 'html.parser')
        
        acronyms = {}
        current_section = "General"
        
        for element in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table']):
            if element.name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                section_title = element.get_text(strip=True)
                if section_title and not section_title.lower().startswith('pulsepoint'):
                    current_section = section_title
                    if current_section not in acronyms:
                        acronyms[current_section] = {}
            elif element.name == 'table':
                if current_section not in acronyms:
                    acronyms[current_section] = {}
                
                rows = element.find_all('tr')
                for row in rows[1:]:
                    cells = row.find_all(['td', 'th'])
                    if len(cells) >= 2:
                        acronym = cells[0].get_text(strip=True)
                        definition = cells[1].get_text(strip=True)
                        if acronym and definition:
                            acronyms[current_section][acronym] = definition
        
        acronyms = {k: v for k, v in acronyms.items() if v}
        logger.info(f"Extracted {len(acronyms)} acronym sections")
        return acronyms
    except Exception as e:
        logger.error(f"Error extracting acronyms: {str(e)}")
        return {}

def extract_stream_leads_from_confluence(page_content):
    """Extract stream leads from Confluence page content"""
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(page_content.get('body', {}).get('storage', {}).get('value', ''), 'html.parser')
        
        stream_leads = {}
        tables = soup.find_all('table')
        
        for table in tables:
            rows = table.find_all('tr')
            if rows:
                header = rows[0]
                headers = [th.get_text(strip=True).lower() for th in header.find_all(['th', 'td'])]
                
                for row in rows[1:]:
                    cells = row.find_all(['td', 'th'])
                    if len(cells) >= 2:
                        row_data = [cell.get_text(strip=True) for cell in cells]
                        
                        if any('stream' in h for h in headers) or any('lead' in h for h in headers):
                            stream_idx = next((i for i, h in enumerate(headers) if 'stream' in h), 0)
                            lead_idx = next((i for i, h in enumerate(headers) if 'lead' in h), -1)
                            
                            if stream_idx < len(row_data):
                                stream_name = row_data[stream_idx]
                                lead_name = row_data[lead_idx] if lead_idx < len(row_data) and lead_idx != -1 else "TBD"
                                if stream_name:
                                    stream_leads[stream_name] = {
                                        'stream': stream_name,
                                        'lead': lead_name
                                    }
        
        logger.info(f"Extracted {len(stream_leads)} stream leads")
        return stream_leads
    except Exception as e:
        logger.error(f"Error extracting stream leads: {str(e)}")
        return {}

def get_jira_field_definitions():
    """Query BigQuery for Jira field definitions"""
    try:
        query = """
        SELECT field_name, description, possible_values
        FROM `pulsepoint-dataproducts.jira.jira_team_tickets_definition`
        ORDER BY field_name
        """
        
        query_job = bq_client.query(query)
        results = query_job.result()
        
        field_definitions = {}
        for row in results:
            field_definitions[row.field_name] = {
                'field_name': row.field_name,
                'description': row.description,
                'possible_values': row.possible_values
            }
        
        logger.info(f"Retrieved {len(field_definitions)} Jira field definitions")
        return field_definitions
    except Exception as e:
        logger.error(f"Error querying BigQuery: {str(e)}")
        return {}

def get_products_and_features_from_jira_definitions():
    """Extract products and features from Jira field definitions"""
    try:
        query = """
        SELECT field_name, possible_values
        FROM `pulsepoint-dataproducts.jira.jira_team_tickets_definition`
        WHERE field_name LIKE '%product%'
        OR field_name LIKE '%Product%'
        OR field_name LIKE '%feature%'
        OR field_name LIKE '%Feature%'
        ORDER BY field_name
        """
        
        query_job = bq_client.query(query)
        results = query_job.result()
        
        products = {}
        features = {}
        
        for row in results:
            if row.possible_values:
                field_name_lower = row.field_name.lower()
                values = row.possible_values.replace('\n', ',').split(',')
                
                for value in values:
                    item = value.strip()
                    if item and len(item) > 1:
                        if 'product' in field_name_lower:
                            products[item] = {
                                'name': item,
                                'source': 'jira_definitions',
                                'field': row.field_name
                            }
                        elif 'feature' in field_name_lower:
                            features[item] = {
                                'name': item,
                                'source': 'jira_definitions',
                                'field': row.field_name
                            }
        
        logger.info(f"Extracted {len(products)} products and {len(features)} features")
        return products, features
    except Exception as e:
        logger.error(f"Error getting products and features: {str(e)}")
        return {}, {}

@functions_framework.http
def daily_github_update(request):
    """SIMPLIFIED V2.5 - WORKING VERSION"""
    start_time = datetime.now()
    logger.info(f"Starting SIMPLIFIED daily GitHub GPT update process v2.5 at {start_time.isoformat()}")
    
    failed_files = []
    successful_files = []
    
    try:
        # Get credentials
        logger.info("Retrieving credentials from Secret Manager")
        confluence_token = get_secret("confluence-api-token")
        github_token = get_secret("github-token")
        confluence_username = "bweinstein@pulsepoint.com"
        
        # 1. Update acronyms.json
        logger.info("=== UPDATING ACRONYMS.JSON ===")
        try:
            acronyms_page = get_confluence_page_content("2092105755", confluence_token, confluence_username)
            if acronyms_page:
                acronyms = extract_acronyms_from_confluence(acronyms_page)
                if acronyms:
                    success = update_github_file("acronyms.json", acronyms, github_token)
                    if success:
                        successful_files.append("acronyms.json")
                    else:
                        failed_files.append("acronyms.json")
                else:
                    failed_files.append("acronyms.json: No acronyms extracted")
            else:
                failed_files.append("acronyms.json: Failed to fetch Confluence page")
        except Exception as e:
            logger.error(f"Error updating acronyms.json: {str(e)}")
            failed_files.append(f"acronyms.json: {str(e)}")
        
        # 2. Update products.json and features.json
        logger.info("=== UPDATING PRODUCTS.JSON AND FEATURES.JSON ===")
        try:
            products, features = get_products_and_features_from_jira_definitions()
            
            if products:
                success = update_github_file("products.json", products, github_token)
                if success:
                    successful_files.append("products.json")
                else:
                    failed_files.append("products.json")
            else:
                failed_files.append("products.json: No products data")
            
            if features:
                success = update_github_file("features.json", features, github_token)
                if success:
                    successful_files.append("features.json")
                else:
                    failed_files.append("features.json")
            else:
                failed_files.append("features.json: No features data")
        except Exception as e:
            logger.error(f"Error updating products/features: {str(e)}")
            failed_files.append(f"products/features: {str(e)}")
        
        # 3. Update stream_leads.json
        logger.info("=== UPDATING STREAM_LEADS.JSON ===")
        try:
            stream_page = get_confluence_page_content("2829746210", confluence_token, confluence_username)
            if stream_page:
                stream_leads = extract_stream_leads_from_confluence(stream_page)
                if stream_leads:
                    success = update_github_file("stream_leads.json", stream_leads, github_token)
                    if success:
                        successful_files.append("stream_leads.json")
                    else:
                        failed_files.append("stream_leads.json")
                else:
                    failed_files.append("stream_leads.json: No stream leads extracted")
            else:
                failed_files.append("stream_leads.json: Failed to fetch Confluence page")
        except Exception as e:
            logger.error(f"Error updating stream_leads.json: {str(e)}")
            failed_files.append(f"stream_leads.json: {str(e)}")
        
        # 4. Update jira_field_definitions.json
        logger.info("=== UPDATING JIRA_FIELD_DEFINITIONS.JSON ===")
        try:
            jira_definitions = get_jira_field_definitions()
            if jira_definitions:
                success = update_github_file("jira_field_definitions.json", jira_definitions, github_token)
                if success:
                    successful_files.append("jira_field_definitions.json")
                else:
                    failed_files.append("jira_field_definitions.json")
            else:
                failed_files.append("jira_field_definitions.json: No Jira definitions retrieved")
        except Exception as e:
            logger.error(f"Error updating jira_field_definitions.json: {str(e)}")
            failed_files.append(f"jira_field_definitions.json: {str(e)}")
        
        # Final result
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        if len(successful_files) >= 4:
            result = {
                "status": "SUCCESS",
                "version": "v2.5",
                "message": "UPDATE COMPLETED",
                "timestamp": end_time.isoformat(),
                "duration_seconds": duration,
                "successful_files": successful_files,
                "failed_files": failed_files,
                "total_successful": len(successful_files),
                "total_failed": len(failed_files)
            }
            logger.info(f"V2.5 UPDATE SUCCESS: {result}")
            return result
        else:
            result = {
                "status": "FAILED",
                "version": "v2.5",
                "message": "TOO MANY FAILURES",
                "timestamp": end_time.isoformat(),
                "duration_seconds": duration,
                "successful_files": successful_files,
                "failed_files": failed_files,
                "total_successful": len(successful_files),
                "total_failed": len(failed_files)
            }
            logger.error(f"V2.5 UPDATE FAILED: {result}")
            return result, 500
    
    except Exception as e:
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        result = {
            "status": "CRITICAL_ERROR",
            "version": "v2.5",
            "message": "CRITICAL FAILURE",
            "timestamp": end_time.isoformat(),
            "duration_seconds": duration,
            "error": str(e),
            "successful_files": successful_files,
            "failed_files": failed_files
        }
        logger.error(f"V2.5 CRITICAL ERROR: {result}")
        return result, 500