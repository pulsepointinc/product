# Advanced Stream & Product Correlation Instructions

## 🎯 **Connect Jira Streams/Products to Confluence Documentation**

Your enhanced workflow should correlate ticket metadata with strategic documentation:

### **Step 0: Terminology & Stream Disambiguation**

**Always search for definitions using these key pages:**

1. **Acronym Dictionary**: Search `"acronyms terms definitions dictionary"`
2. **Stream Roadmap**: Search `"2025 Stream Leads Roadmap stream leads"`
3. **Product Mapping**: Search relevant product documentation

### **Step 1: Multi-Source Intelligence Gathering**

For any query about streams, products, or roadmaps:

**A. Get Strategic Context (RAG):**
```json
{
  "query": "[stream/product] roadmap strategy 2025 stream leads",
  "max_results": 10
}
```

**B. Get Operational Reality (BigQuery):**
```json
{
  "project": "PROD",
  "status": "various",
  "sprint": "current"
}
```

**C. Cross-Reference Implementation (BigQuery Status):**
```json
{
  "project": "PROD", 
  "status": "Needs Grooming",
  "max_results": 100
}
```

### **Step 2: Stream-to-Documentation Correlation**

**Major PulsePoint Streams (from ticket data):**
- **Omnichannel** → Search "Omnichannel Audiences platform strategy"
- **Deal Platform** → Search "Deal Platform roadmap marketplace"
- **Campaign Management** → Search "Life Campaign Management platform"
- **Analytics** → Search "Report Builder HCP365 analytics"
- **Creatives** → Search "Creative Management platform"
- **List Management** → Search "NPI List Management Studio"
- **AI Foundation** → Search "AI Analytics Agent Newton"
- **Planning** → Search "Media Planner tools"
- **Reporting** → Search "Report Builder dimensions"

### **Step 3: Enhanced Response Integration**

```markdown
# [Stream/Product] Intelligence Analysis

## Strategic Direction (from Confluence)
**Stream Lead**: [From 2025 Stream Leads page]
**Strategic Goals**: [From roadmap documentation]
**Key Initiatives**: [From product docs]

## Operational Status (from Jira Tickets)
**Active Development** (August 2025):
- [Current sprint tickets with assignees]
**Needs Grooming** (44 total PROD tickets):
- [Tickets by stream breakdown]
**Recent Delivery** (July 2025):
- [Completed tickets with dates]

## Stream Correlation Analysis
**Documentation vs Reality:**
- Planned: [Strategic initiatives from docs]
- In Progress: [Active tickets by stream] 
- Pipeline: [Grooming tickets by stream]
- Delivered: [Recent completions]

**Resource Allocation:**
- Team Focus: [Assignee patterns by stream]
- Priority Distribution: [Ticket priorities]
- Cross-Stream Dependencies: [Epic linkages]

## Intelligence Insights
[Correlations between strategy and execution]
```

### **Example: Omnichannel Stream Analysis**

**RAG Searches:**
1. `"Omnichannel Audiences strategy roadmap 2025"`
2. `"Global Identifier Selection expansion benchmarking"`
3. `"2025 Stream Leads Omnichannel"`

**BigQuery Queries:**
1. Current sprint: Filter by `stream = "Omnichannel"`
2. Status query: `"Needs Grooming"` + filter by Omnichannel
3. July release: Filter by `stream = "Omnichannel"`

**Expected Correlation:**
```markdown
# Omnichannel Stream Intelligence

## Strategic Direction
**Stream Lead**: [From Stream Leads page]
**2025 Goals**: Platform expansion, identifier standardization, benchmarking

## Current Development (August 2025)
**Active Tickets**: 0 in current sprint
**Needs Grooming**: 9 Omnichannel tickets requiring planning
- PROD-13381: Global Identifier Selection
- PROD-13359: External Audience Visibility  
- PROD-13360: Display External Audience Size

## Recent Delivery (July 2025)
**No Omnichannel tickets delivered** → Focus shift to planning phase

## Intelligence Analysis
- **Strategic docs show**: Major identifier standardization initiative
- **Ticket reality shows**: Heavy grooming activity (9 tickets)
- **Correlation**: Planning phase for major Q4 2025 delivery
- **Resource pattern**: Jifei Lin primary assignee, Donovan Ly leading
```

### **Advanced Queries for ChatGPT**

**Stream Health Check:**
```
"Show me the current status of [stream] including strategy docs, active development, and grooming pipeline"
```

**Product Roadmap Synthesis:**
```  
"Analyze [product] roadmap combining documentation with actual ticket delivery timelines"
```

**Cross-Stream Analysis:**
```
"Compare development velocity across Deal Platform, Omnichannel, and Analytics streams"
```

### **Key Correlation Points**

✅ **Stream strategy** ↔ **Actual ticket allocation**
✅ **Documented timelines** ↔ **Real delivery dates**  
✅ **Product specifications** ↔ **Implementation tickets**
✅ **Resource planning** ↔ **Assignee patterns**
✅ **Epic roadmaps** ↔ **Sprint execution**

This creates true intelligence by connecting strategic intent with operational reality!