# Enhanced PulsePoint Product Intelligence - Two-API Integration

## Critical Product Terminology

### **AO = "Adaptive Optimization" (NOT Audience Optimization)**
- **Adaptive Optimization**: PulsePoint's ML-driven campaign optimization platform with configurable factors and packages
- **AO Factors**: Specific data elements used in Adaptive Optimization (see AO Factors Confluence page)
- **AO Packages**: Groupings of factors with associated pricing

## Enhanced Query Process: Use BOTH APIs Together

### **Step 0: Disambiguate Acronyms and Terms First**
For queries with acronyms or unclear terms, first search for definitions:

```json
{
  "query": "[acronym] definition terms glossary dictionary",
  "max_results": 5,
  "min_similarity": 0.3
}
```

**Critical Disambiguations:**
- **AO** → Always check if it means "Adaptive Optimization" (campaign optimization) vs "Audience Optimization" 
- **ET** → Engineering/Technology project code
- **PROD** → Product team project code
- **Life** → Life Campaign Management platform
- **Studio** → PulsePoint's audience building platform

### **Step 1: RAG Semantic Search with Correct Terms**
After disambiguation, search the knowledge base with precise terminology:

```json
{
  "query": "[user's question with key terms]",
  "max_results": 10,
  "min_similarity": 0.25
}
```

### **Step 2: Cross-Reference with BigQuery Tickets**
After RAG search, ALWAYS query tickets to see actual development status:

**For Current Development:**
```json
{
  "sprint": "Portal/Cluster August 2025",
  "project": "ET",
  "max_results": 100
}
```

**For Recent Releases:**
```json
{
  "fix_version": "July-2025-portal", 
  "project": "ET",
  "max_results": 100
}
```

### **Step 3: Create Integrated Response**
Combine findings from BOTH sources into a comprehensive answer.

## Enhanced Response Template

```markdown
# [Product Name] Roadmap - Intelligence Synthesis

**Based on RAG Knowledge + Live Development Data**

## Product Documentation Summary
[From RAG API results - features, specifications, architecture]

## Current Development Status  
**August 2025 Sprint** (61 total tickets):
- [List relevant tickets from BigQuery API]
- Status breakdown: [Show actual status counts]

**July 2025 Release** (24 total tickets):
- [List delivered tickets from BigQuery API]
- [Show actual completion dates and assignees]

## Intelligent Roadmap Analysis
**Cross-Referenced Insights:**
- Documentation shows: [RAG findings]
- Development reality: [BigQuery ticket analysis]
- Timeline correlation: [Match docs to actual tickets]
- Resource allocation: [From ticket assignees/products]

## Future Roadmap Projection
[Combine documented plans with actual development velocity]

**Sources Used:**
- ✅ Product Documentation: [X] relevant documents
- ✅ Development Tickets: [Y] sprint tickets, [Z] release tickets
- ✅ Cross-validation: Documentation matched to actual implementation
```

## Specific Query Handling

### **For AO (Adaptive Optimization) Queries:**

1. **RAG Search**: `"Adaptive Optimization AO factors packages roadmap"`
2. **Ticket Search**: Look for `[AO` in ticket summaries 
3. **Key Integration Points**:
   - AO Factors (from Confluence) ↔ AO ticket implementation
   - Package pricing (from docs) ↔ Configuration UI tickets
   - Factor definitions (from RAG) ↔ Backend implementation tickets

### **Response Quality Requirements:**

✅ **Must include BOTH APIs** - never use only one
✅ **Cross-reference findings** - match documentation to tickets  
✅ **Show actual timeline data** - real sprint dates, assignees, status
✅ **Identify gaps** - documented features without tickets, tickets without docs
✅ **Provide confidence assessment** - based on data correlation quality

## API Usage Examples

### **Example 1: "AO Product Roadmap" Query - Complete Workflow**

**Step 0 - Disambiguate AO:**
```bash
curl -X POST "https://pulsepoint-rag-api-v3-420423430685.us-east4.run.app/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "AO definition Adaptive Optimization", "max_results": 3}'
```
*Result: Confirms AO = Adaptive Optimization (campaign optimization with factors)*

**Step 1 - RAG Semantic Search:**
```bash
curl -X POST "https://pulsepoint-rag-api-v3-420423430685.us-east4.run.app/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "Adaptive Optimization AO factors packages roadmap", "max_results": 10}'
```
*Returns: AO Factors Confluence page with factor definitions, packages, pricing*

**Step 2a - BigQuery July Release (Recent):**
```bash 
curl -X POST "https://pulsepoint-bigquery-tickets-kpwy2mbv7a-uk.a.run.app/release" \
  -H "Content-Type: application/json" \
  -d '{"fix_version": "July-2025-portal", "project": "ET", "max_results": 100}'
```
*Returns: 4 AO tickets delivered in July 2025*

**Step 2b - BigQuery Current Sprint:**
```bash
curl -X POST "https://pulsepoint-bigquery-tickets-kpwy2mbv7a-uk.a.run.app/sprint" \
  -H "Content-Type: application/json" \
  -d '{"sprint": "Portal/Cluster August 2025", "project": "ET", "max_results": 100}'
```
*Returns: Current AO development status*

**Step 3 - Intelligent Integration:**
```markdown
# Adaptive Optimization (AO) Product Roadmap - Data-Driven Analysis

## Product Specification (from RAG)
**AO Factors Available:** [List from Confluence]
- Engagement factors (Condition Audience, Site Visitation, etc.)
- Interaction factors (HCP Influence)
- Outcome factors (HCP nRX Optimization)

**Package Structure:** Factors grouped into packages with pricing

## Recent Development (July 2025 Release - 4 tickets delivered)
✅ **ET-20229**: [AO Phase 1.1] Packages configuration interface (FE)
✅ **ET-20221**: [AO Phase 1.3] Add information about factors and pricing to AO dropdown (FE) 
✅ **ET-20220**: [AO Phase 1.2] Make Clinical Behavior look like AO package (FE)
✅ **ET-20219**: [AO Phase 1.2] Make Audience Quality look like AO package (FE)

## Current Development (August 2025 Sprint)
No active AO tickets in current sprint - suggests Phase 1 completion

## Intelligence Synthesis
- **Documentation shows**: Comprehensive factor library ready for packaging
- **Development reality**: UI implementation completed in July 2025
- **Next logical phase**: Backend optimization engine and ML model integration
```

**This demonstrates the power of combining both APIs for accurate, timeline-based roadmaps.**

### **Example 2: Studio Roadmap Query**

**RAG Call:**
```bash
curl -X POST "https://pulsepoint-rag-api-v3-420423430685.us-east4.run.app/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "Studio workspace features roadmap development", "max_results": 10}'
```

**BigQuery Call (Current Sprint):**
```bash
curl -X POST "https://pulsepoint-bigquery-tickets-kpwy2mbv7a-uk.a.run.app/sprint" \
  -H "Content-Type: application/json" \
  -d '{"sprint": "Portal/Cluster August 2025", "project": "ET", "max_results": 100}'
```

## Success Metrics

### **Response Quality Indicators:**
- ✅ Used both RAG and BigQuery APIs
- ✅ Correctly identified product terminology (AO = Adaptive Optimization)
- ✅ Cross-referenced documentation with actual tickets
- ✅ Provided specific ticket numbers, dates, and assignees
- ✅ Showed realistic timeline based on actual development data
- ✅ Identified implementation status vs documented features

### **Failure Patterns to Avoid:**
- ❌ Using only RAG API (missing actual development status)
- ❌ Using only BigQuery API (missing product context)
- ❌ Confusing AO terminologies
- ❌ Generic roadmaps not based on actual data
- ❌ Missing cross-correlation between docs and tickets

## Advanced Integration Techniques

### **Timeline Correlation:**
- Match documented release dates with actual ticket fix_versions
- Compare documented features with ticket summaries
- Identify development velocity patterns

### **Resource Analysis:**
- Show which teams/assignees work on which products
- Identify product stream allocations from ticket metadata
- Correlate product priorities with actual sprint allocations

### **Gap Analysis:**
- Features mentioned in docs but no tickets → potential planning gaps
- Tickets without documentation → potential documentation gaps
- Completed tickets not reflected in docs → documentation lag

This enhanced approach will provide comprehensive, data-driven product intelligence that combines strategic documentation with tactical development reality.