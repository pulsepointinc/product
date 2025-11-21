# PulsePoint JIRA API v2 - Complete Instructions

## CRITICAL: Multi-Project Queries
**NEVER use comma-separated project keys** like `project_key=PROD,ET,STUD,DPD`. 

**Instead, make separate API calls:**
```
GET /tickets?sprint_date=September%202025&project_key=PROD&limit=200
GET /tickets?sprint_date=September%202025&project_key=ET&limit=200  
GET /tickets?sprint_date=September%202025&project_key=STUD&limit=200
GET /tickets?sprint_date=September%202025&project_key=DPD&limit=200
```

## Sprint Breakdown Query Pattern
For "breakdown of tickets in current sprint by team/stream":

1. **Call each project separately** (4 API calls)
2. **Aggregate totals** from `pagination.total` 
3. **Group by `team` and `stream` fields** from ticket data
4. **Expected September 2025 totals:**
   - PROD: ~39 tickets (Product Management)
   - ET: ~118 tickets (Front End Portal Development)  
   - STUD: ~1 ticket (Business Intelligence)
   - DPD: ~0 tickets
   - **Total: ~158 tickets**

## Working Parameters (All Tested ✅)

### Core Filters
- `sprint_date`: "September 2025", "August 2025", "October 2025"
- `release_date`: "September 2025", "October 2025" (for roadmap queries)
- `project_key`: Single values only - "PROD", "ET", "STUD", "DPD"
- `issue_type`: "6" (Epic), "7" (Story), "3" (Task)

### People Filters (Partial Matching)
- `assignee`: "Jifei" finds "Jifei Lin", "Bryan" finds "Bryan Weinstein"
- `reporter_name`: "Kenan" finds "Kenan Akin", "Divya" finds "Divya Suri"
- `product_manager`: "any" for PM-managed tickets, or partial names

### Other Filters
- `status`: "Open", "In Progress", "Closed"
- `stream`: "Analytics", "Reporting", "Campaign Management"
- `product`: "Studio Platform", "Campaign Debugger"
- `limit`: Max results per call (default 100, use 200 for full data)

## Product Management Workflow
- **Epics** (PROD project): Have `release_date`, may not have `sprint_date`
- **Stories**: Have both `sprint_date` AND inherit epic's `release_date`
- **For "stories in current release"**: Use `release_date=September 2025&project_key=PROD`
- **For "epics in current sprint"**: Epics are included if their child stories have the sprint_date

## Response Format
```json
{
  "pagination": {"total": 39, "count": 39, "has_next": false},
  "tickets": [
    {
      "issue_key": "PROD-14016",
      "summary": "Trusting NPI from Publishers", 
      "team": "Product Management",
      "stream": "Platform Administration",
      "assignee": "Jifei Lin",
      "sprint_date": "September 2025",
      "release_date": "September 2025",
      "status": "Open",
      "issue_type": 6
    }
  ]
}
```

## Key Team Classifications
- **Product Management**: PROD project tickets
- **Front End Portal Development**: Most ET project tickets  
- **Front End Cluster Development**: ET tickets with Andrii/cluster work
- **Business Intelligence Development**: STUD project tickets
- **Data Product Development**: DPD project tickets

## Common Patterns

**Current Sprint Breakdown:**
```
4 separate calls with sprint_date=September 2025
Aggregate by team/stream fields
```

**Product Roadmap:**
```  
GET /tickets?release_date=September 2025&project_key=PROD&product_manager=any
```

**Person's Workload:**
```
GET /tickets?assignee=Jifei&sprint_date=September 2025&project_key=PROD,ET,STUD,DPD
(Make 4 separate calls, one per project)
```

**Epic and Stories:**
```
Epics: issue_type=6&project_key=PROD  
Stories: issue_type=7&project_key=ET,PROD
```

## Error Prevention
- ❌ Never use `project_key=PROD,ET,STUD,DPD`  
- ❌ Don't expect comma-separated values to work
- ✅ Always make separate calls per project
- ✅ Use `limit=200` for comprehensive data
- ✅ Check `pagination.total` for actual counts
- ✅ Use partial names for people (Jifei vs Jifei Lin)

## URLs
- **API Base**: https://pulsepoint-jira-api-v2-420423430685.us-east4.run.app
- **Health Check**: GET /
- **Tickets**: GET /tickets (with query parameters)

This approach ensures you get complete data across all 158 tickets instead of zero results.