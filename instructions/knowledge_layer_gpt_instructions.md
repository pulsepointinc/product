# Knowledge Layer v16.1 – CustomGPT Integration Instructions

## Endpoint
- URL: https://us-east4-pulsepoint-datahub.cloudfunctions.net/knowledge-orchestrator-v16-1
- Method: POST
- Content-Type: application/json
- Auth: Public (no auth required)

## Request Body
{
  "question": string,                      // required
  "max_results": number,                   // optional (default 50)
  "conversation_history": [                // optional
    { "role": "user|assistant", "content": string }
  ],
  "session_id": string                     // optional; generated if absent
}

Notes:
- Team and product intent are inferred from natural language. Aliases (e.g., FE, BI, Omni/OA/Audience Manager) are normalized via GPT/acronyms.json.
- Jira payload is built from the intent: team, product (e.g., "Adaptive Optimization"), stream (e.g., "Campaign Management"), sprint_date, etc.
- Confluence queries are optimized based on question type:
  - Sprint work questions: Single keyword-based query
  - Comparison questions: Multiple targeted queries for each entity (e.g., "Medscape Moments", "WebMD Moments", "Moments")
- Total response length is capped (~4000 words target) for CustomGPT stability.

## Response (Primary Fields)
{
  "synthesis_response": {
    "query": string,
    "response_metadata": {
      "timestamp": string,
      "token_budget": number,
      "response_type": string,             // synthesized_multi_source | comparative_analysis | fallback_synthesis
      "sources_synthesized": ["jira","confluence"]
    },
    "executive_summary": {
      "headline": string,
      "total_story_points": number,
      "team": string
    },
    "tickets": [                           // present for ticket queries
      {
        "ticket_id": string,
        "title": string,
        "story_points": number,
        "assignee": string,
        "epic": string,
        "confluence_context": { "key_points": [string] }
      }
    ],
    "epics_summary": { "EPIC-KEY": { "name": string, "points": number, "status": string }},
    "comparison_matrix": { ... },          // present for comparison queries
    "key_differences": [ { "aspect": string, "webmd": string, "medscape": string } ],
    "actionable_recommendations": [ { "priority": string, "action": string, "reason": string } ],
    "links": { "jql_query": string },
    "api_status": {
      "data_sources_queried": number,
      "jira_query_success": boolean,
      "confluence_api_success": boolean,
      "gemini_synthesis_used": boolean
    },
    "session_id": string,
    "version": "16.1-JIRA-CONFLUENCE"
  }
}

## Usage Examples

- Current sprint AO tickets for Front End Portal team (should yield 4 ET tickets)
curl -s -X POST "https://us-east4-pulsepoint-datahub.cloudfunctions.net/knowledge-orchestrator-v16-1" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Can you tell me the details of all the AO tickets i have in the current sprint for the Front End Portal Development team?",
    "max_results": 100
  }' | jq

- Follow-up comparison (uses conversation history)
curl -s -X POST "https://us-east4-pulsepoint-datahub.cloudfunctions.net/knowledge-orchestrator-v16-1" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the difference between WebMD and Medscape Moments?",
    "max_results": 10,
    "conversation_history": [
      {"role": "user", "content": "Can you tell me the details of all the AO tickets i have in the current sprint for the Front End Portal Development team?"}
    ]
  }' | jq

## Context Sources
- Jira v4 Dual-Mode Tickets API (internal)
- Confluence Search API (internal)
- GPT folder context (public) for acronyms/aliases and domain JSON:
  - https://github.com/pulsepointinc/product/tree/main/GPT
  - https://github.com/pulsepointinc/product/blob/main/GPT/acronyms.json

## Notes
- The knowledge layer automatically normalizes team aliases (e.g., "FE", "BI", "Omni", "OA", "Audience Manager").
- If the team is omitted, the response may include a broader set of tickets across projects.
- For AO-only results, include Adaptive Optimization in the question, or rely on AO intent detection.
- Stream detection works for domains like "Campaign Management", "Analytics", "Clinical Insights", etc.
- Comparison questions automatically trigger multiple Confluence queries for comprehensive analysis.
