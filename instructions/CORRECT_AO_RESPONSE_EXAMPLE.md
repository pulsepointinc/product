# Correct AO Response Example

## 🎯 **What ChatGPT Should Return for "AO Product roadmap"**

### **✅ CORRECT Response Format:**

```markdown
# Adaptive Optimization (AO) Product Roadmap

## Strategic Context (from Documentation)
**AO Factors Confluence Page**: Comprehensive factor library including:
- Engagement factors: Condition Audience, Site Visitation, WebMD engagement
- Interaction factors: HCP Influence
- Outcome factors: HCP nRX Optimization, DTC Condition Density

**Package Structure**: Factors grouped into packages with pricing

## Development Reality (from Tickets)
**Recent Delivery (July 2025)**: 4 AO tickets completed
- ✅ [ET-20229](https://ppinc.atlassian.net/browse/ET-20229) - [AO Phase 1.1] Packages configuration interface (FE)
- ✅ [ET-20221](https://ppinc.atlassian.net/browse/ET-20221) - [AO Phase 1.3] Add factors and pricing to AO dropdown (FE)
- ✅ [ET-20220](https://ppinc.atlassian.net/browse/ET-20220) - [AO Phase 1.2] Make Clinical Behavior look like AO package (FE)
- ✅ [ET-20219](https://ppinc.atlassian.net/browse/ET-20219) - [AO Phase 1.2] Make Audience Quality look like AO package (FE)

**Current Sprint (August 2025)**: No active AO tickets

## Intelligence Correlation
- **Documentation shows**: Comprehensive factor library ready for packaging
- **Development reality**: UI implementation completed in July 2025 (Phase 1)
- **Timeline analysis**: Front-end packaging complete, suggests backend optimization next
- **Next logical phase**: Factor selection logic and ML optimization engine

## 📚 Sources & Links
**Jira Tickets:**
- [ET-20229](https://ppinc.atlassian.net/browse/ET-20229) - AO Phase 1.1 Packages configuration interface
- [ET-20221](https://ppinc.atlassian.net/browse/ET-20221) - AO Phase 1.3 Factors and pricing dropdown
- [ET-20220](https://ppinc.atlassian.net/browse/ET-20220) - AO Phase 1.2 Clinical Behavior package
- [ET-20219](https://ppinc.atlassian.net/browse/ET-20219) - AO Phase 1.2 Audience Quality package

**Confluence:**
- [AO Factors](https://ppinc.atlassian.net/wiki/spaces/pt/pages/3098836997/AO+Factors) - Complete factor definitions and categories

**APIs Used:**
- RAG Search: "Adaptive Optimization factors packages"
- BigQuery Release: July-2025-portal ET tickets
```

### **❌ WRONG Response (What ChatGPT Currently Does):**
- References Omnichannel tickets (PROD-13786, PROD-13604, etc.)
- Talks about "audience expansion" instead of "adaptive optimization"
- Misses the actual AO tickets (ET-20229, ET-20221, etc.)
- Confuses audience targeting with campaign optimization

### **🔧 Fix Applied:**
Updated `CHATGPT_CONDENSED_INSTRUCTIONS.md` with:
- Explicit AO disambiguation 
- Specific search terms for AO
- Real AO ticket examples
- Instructions to ignore Omnichannel results