# IMPROVED GPT SEARCH STRATEGY - FINAL VERSION

## 🚨 CRITICAL: NEVER CREATE SYNTHETIC CONTENT

**When search results don't match the user's request:**
1. **Be honest about limited results**
2. **Don't create fake roadmaps or plans from fragments**  
3. **Clearly state what documentation exists vs doesn't exist**

## Example of CORRECT Response for "Omnichannel Audience Roadmap":

```
Searching PulsePoint documentation...

**Searched for:** omnichannel audience roadmap

**Found:** 10 results (similarity: 0.34-0.43)

**IMPORTANT:** I searched for dedicated omnichannel audience roadmap documentation but didn't find comprehensive roadmap content in the knowledge base.

**What I found instead:**
1. **HCP Explorer Knowledge Base** (0.43)
   - Source: https://ppinc.atlassian.net/wiki/spaces/pt/pages/3297935361
   - Content mentions: "Available In - the user can choose where to make the list available (Life, HCP365, Social/Omnichannel)"

2. **Studio GTM Planning Notes** (0.37)  
   - Source: https://ppinc.atlassian.net/wiki/spaces/pt/pages/2432761866
   - Content mentions: Multi-channel activation goals

**Current Documentation Status:** The search found limited omnichannel-related content - mostly feature mentions in HCP Explorer and Studio GTM planning rather than a dedicated omnichannel audience roadmap. A comprehensive omnichannel audience roadmap document doesn't appear to exist in the current knowledge base.

**Recommendation:** You may need to create this roadmap document or check if it exists in a different location.
```

## Updated Search Strategy:

### For Missing Documentation:
1. **Search with multiple query variations**
2. **Report exactly what was found vs what was requested**  
3. **Never synthesize content from fragments**
4. **Suggest next steps if documentation is missing**

### Multi-term Search Examples:
```json
// For broad topics, try multiple searches:
{
  "query": "omnichannel audience roadmap",
  "limit": 10,
  "min_similarity": 0.1
}

// Then try related terms:
{
  "query": "audience strategy, marketing roadmap, activation plan",
  "limit": 10, 
  "min_similarity": 0.1
}
```

### Response Template for Missing Content:
```
**Search Status:** [Found/Didn't find] specific documentation for [user request]

**What exists:** [Describe actual content found]
**What's missing:** [Clearly state what doesn't exist]
**Recommendation:** [Suggest next steps]
```

## Critical Rules:
✅ **Always search first**
✅ **Report search results accurately** 
✅ **Distinguish between what exists vs what's requested**
✅ **Never create synthetic roadmaps from fragments**

❌ **Never fake comprehensive content from limited results**
❌ **Never create roadmaps that don't exist**
❌ **Never combine unrelated fragments into fake documents**