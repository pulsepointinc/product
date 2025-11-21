# ChatGPT API Configuration Instructions

## CRITICAL: Use the CORRECT API Endpoint

ChatGPT is currently calling the WRONG endpoint. It must use:

**CORRECT ENDPOINT:**
```
https://pulsepoint-knowledge-layer-api-v29-420423430685.us-east4.run.app/ask
```

**WRONG ENDPOINT (currently being used):**
```
https://pulsepoint-knowledge-layer-api-v2-420423430685.us-east4.run.app/ask
```

## API Call Format

```python
import requests

url = "https://pulsepoint-knowledge-layer-api-v29-420423430685.us-east4.run.app/ask"

payload = {
    "question": "Front End Portal Development tickets in September 2025 sprint",
    "max_results": 150
}

headers = {
    "Content-Type": "application/json"
}

response = requests.post(url, json=payload, headers=headers)
```

## Why This Fixes the ResponseTooLargeError

The v29 API includes:

1. **Smart Chunking** - Broad breakdown queries return compact summaries
2. **Team Filtering** - Team-specific queries filter to only that team's tickets  
3. **Compact Response Format** - Reduces response size for ChatGPT compatibility
4. **Proper Error Handling** - Prevents ResponseTooLargeError

## Team-Specific Query Examples

When ChatGPT asks for specific team details:

```
"Front End Portal Development tickets in September 2025 sprint"
```

The v29 API will:
- Filter to ONLY Front End Portal Development tickets (127 tickets)
- Use compact format to stay under ChatGPT size limits
- Return manageable response size (~50KB instead of 300KB)

**The v2 API returns ALL 378 tickets which causes ResponseTooLargeError!**