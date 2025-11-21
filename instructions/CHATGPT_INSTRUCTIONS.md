# ChatGPT Actions Update Instructions

## API Fixed - New Working Endpoints

Replace the broken BigQuery tickets API URL in your ChatGPT Actions with:

**NEW WORKING API URL:**
```
https://pulsepoint-jira-tickets-fixed-420423430685.us-east4.run.app
```

## Key Changes Made

1. **Fixed parameter processing** - API now actually filters results instead of ignoring parameters
2. **Added missing `assigned` parameter** - properly filters by assignee name
3. **Added `reporter` parameter** - filters by who created the ticket  
4. **Added `next_sprint` parameter** - filters for September 2025 sprint (if it exists)

## Important Notes

1. **Use FULL NAMES** - Must use "Roman Kuzmych" not just "Roman"
2. **Current working sprint** - "Active Product" (not September 2025)
3. **Tested and verified** - All parameters now work correctly

## Working Examples

**Get Roman's current sprint tickets:**
```
assigned=Roman Kuzmych&sprint=Active Product
```

**Get Roman's tickets in upcoming sprint (if exists):**
```
assigned=Roman Kuzmych&next_sprint=true
```

## Upload This YAML

Use the updated YAML file: `gpt_sources_deploy/bigquery_tickets_fixed.yaml`

The API now returns properly filtered results instead of all 22,000+ tickets.