# Dialy: Improvements & Business Model Proposal

## Executive Summary

Dialy is a mobile-first platform that helps users find mobile money withdrawal points (ATMs, agents) near them in underserved markets. This document outlines recent technical improvements, strategic feature enhancements, and a comprehensive business model to monetize the platform while maintaining user trust and privacy.

---

## Part 1: Recent Technical Improvements (Completed)

### 1.1 Point Visibility & Data Access
**Status**: ✅ Implemented

**What Changed**:
- Confirmed that all authenticated users can see all active cash points on the map
- Verified that points are never linked to individual users who added them
- Database-level access controls ensure privacy while maintaining transparency

**Why It Matters**: This ensures democratic access to cash point data while protecting user privacy. Everyone benefits from crowdsourced location data without exposing individual withdrawal patterns.

### 1.2 Distance-Based Filtering (100m Radius)
**Status**: ✅ Implemented

**What Changed**:
- Updated `nearestPoints()` function in `src/lib/domain/points.ts` to accept an optional radius parameter
- Set NEARBY_RADIUS_M = 100 in MapScreen.svelte
- Modified nearby points calculation to filter out points beyond 100 meters
- Updated NearbySheet.svelte to display distance badges with improved visual feedback

**Technical Details**:
```typescript
// Before: showed nearest 20 points regardless of distance
const nearby = nearestPoints(visiblePoints, geolocation.fix, NEARBY_LIMIT);

// After: only shows points within 100m radius, up to 20 points
const nearby = nearestPoints(visiblePoints, geolocation.fix, NEARBY_LIMIT, NEARBY_RADIUS_M);
```

**User Impact**:
- Users see only truly "nearby" points (within 100m)
- Empty nearby list now shows "No points here yet (100m radius)" - clearer messaging
- Distance badges on each point show exact distance
- Map points beyond 100m are still visible on map but not listed in "Nearby" sheet

### 1.3 Explicit Search Button for Agent Code
**Status**: ✅ Implemented

**What Changed**:
- Transformed reactive search into explicit submit-based search
- Added dedicated "Search" button in agent code input (MapSearch.svelte)
- Implemented draft state management to separate input from filter application
- Improved keyboard accessibility with proper form handling

**Technical Details**:
```typescript
// Before: filter updated on every keystroke
oninput={(event) => setCode(event.currentTarget.value)}

// After: input stored in draft, only applied on submit
<form onsubmit={applySearch}>
  <input oninput={(event) => setCode(event.currentTarget.value)} />
  <button type="submit">{m.map_search_submit()}</button>
</form>
```

**User Impact**:
- Users can type an agent code without live filtering
- Search is triggered by clicking "Search" button or pressing Enter
- Clear button remains for quick reset
- Mobile-friendly: no accidental filtering while typing
- Accessibility: proper form semantics for keyboard navigation

### 1.4 Saved Points List Independence
**Status**: ✅ Verified

**What Changed**:
- Confirmed SavedList.svelte shows all saved points regardless of distance
- Distance is displayed as informational only, not filtering
- Saved points remain accessible even when far away

**Why This Matters**: Users may save points for future reference (e.g., favorite agent near work, weekend location). Distance filtering would hide relevant saved data.

### 1.5 Message Keys & Localization
**Status**: ✅ Implemented

**What Changed**:
- Added `map_search_submit` message key to English and French message files
- Ensures consistent UI text across languages:
  - English: "Search"
  - French: "Rechercher"

---

## Part 2: Future Feature Improvements (Recommended)

### 2.1 Point Ratings & Reviews System
**Priority**: High  
**Estimated Effort**: 2-3 weeks

**Description**:
Users can rate points and leave reviews:
- ⭐ 1-5 star rating system
- Comment field: "Agent was friendly", "Long queue", "No change available"
- Upvote helpful reviews
- Filter points by rating

**Benefits**:
- Improves point quality feedback loop
- Helps agents maintain reputation
- Users make better choices
- Agents incentivized to improve service

**Database Changes**:
```sql
CREATE TABLE point_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  point_id UUID NOT NULL REFERENCES public.points(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(point_id, user_id) -- one review per user per point
);
```

### 2.2 Real-Time Point Status Updates
**Priority**: High  
**Estimated Effort**: 3-4 weeks

**Description**:
Users can report point status (availability, operational hours, issues):
- "Agent not available right now"
- "Machine is broken"
- "Out of cash"
- "System down"
- Status expires after 2 hours (timestamp-based)

**Benefits**:
- Real-time availability information
- Reduces failed withdrawal attempts
- Better user experience

**Database Changes**:
```sql
CREATE TABLE point_status_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  point_id UUID NOT NULL REFERENCES public.points(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT CHECK (status IN ('available', 'unavailable', 'busy', 'broken', 'no_cash')),
  reason TEXT,
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '2 hours'
);
```

### 2.3 Operating Hours & Service Info
**Priority**: Medium  
**Estimated Effort**: 2 weeks

**Description**:
Track point opening/closing hours and services:
- Operating hours (9 AM - 6 PM, for example)
- Services available (cash withdrawal, airtime, insurance, etc.)
- Language support
- AML/KYC verification requirements

**User Impact**: Better planning, avoid closed agents, know what services are available

### 2.4 Favorites & Smart Sorting
**Priority**: Medium  
**Estimated Effort**: 1 week

**Description**:
Enhance saved points with preferences:
- Mark frequently used points as "favorite"
- Sort nearby by: distance, frequency of use, rating, last used
- Create custom collections ("Home agents", "Work agents", "Weekend spots")

### 2.5 Push Notifications
**Priority**: Medium  
**Estimated Effort**: 2-3 weeks

**Description**:
Opt-in notifications for:
- New highly-rated points near you
- Status changes of saved points (goes offline/back online)
- Network promotions or cash-back offers

**Privacy**: Opt-in only, GDPR compliant, no tracking

### 2.6 Offline Map Improvements
**Priority**: Low  
**Estimated Effort**: 1-2 weeks

**Description**:
Enhance existing offline capabilities:
- Pre-download favorite areas with ratings and reviews
- Show ratings/status even in offline mode
- Allow point discovery by name/code offline

### 2.7 Agent Dashboard & Analytics
**Priority**: High (for B2B)  
**Estimated Effort**: 4-6 weeks

**Description**:
For business agents/networks:
- View traffic statistics (how many people viewed this agent)
- See common reasons for negative reviews
- Manage operating hours and services
- Monitor withdrawal frequency trends
- Respond to reviews

**Monetization**: Premium feature for networks/agents ($50-200/month)

### 2.8 API & Data Access
**Priority**: Medium  
**Estimated Effort**: 2-3 weeks

**Description**:
Sell anonymized data access:
- Point availability trends
- Geographic demand patterns
- Network utilization heatmaps
- Cash availability forecasts

**Target Customers**:
- Financial institutions
- Government agencies
- NGOs working on financial inclusion
- Mobile money networks

---

## Part 3: Business Model & Monetization

### 3.1 Revenue Streams

#### Stream 1: Transaction Commission (Primary)
**Model**: 0.5% - 2% commission per withdrawal facilitated through the app

**Implementation**:
- Partner with mobile money networks (MTN, Orange Money, etc.)
- Each withdrawal tracked in `withdrawals` table includes app attribution
- Payment flows through mobile money partner APIs
- Daily takes commission automatically

**Advantages**:
- Aligned with user success (they only pay if transaction succeeds)
- Passive revenue as app usage scales
- Sustainable long-term revenue

**Challenges**:
- Requires negotiations with networks
- Must maintain clear user trust (transparent about commission)

**Revenue Projection**:
- 10,000 users × 2 withdrawals/month × $20 avg × 1% = $4,000/month
- 100,000 users × 4 withdrawals/month × $20 avg × 1% = $80,000/month
- 1,000,000 users × 4 withdrawals/month × $20 avg × 1% = $800,000/month

#### Stream 2: Premium Subscription
**Model**: $2-5/month for power users

**Premium Features**:
- Unlimited saved points (vs. 50 limit for free)
- Advanced filters (by rating, hours, services)
- Priority access to new points
- Personalized alerts for top-rated agents
- Offline maps of favorite areas
- Ad-free experience
- Early access to new features

**Revenue Projection**:
- 5% adoption rate × 10,000 users × $3/month = $1,500/month
- 5% adoption rate × 100,000 users × $3/month = $15,000/month
- 10% adoption rate × 1,000,000 users × $3/month = $300,000/month

#### Stream 3: Agent/Network Premium Dashboard
**Model**: $99-299/month per network or agent

**Features**:
- Performance analytics (views, withdrawals, ratings)
- Operating hours management
- Service offerings management
- Review management & responses
- Competitor intelligence (nearby agents, ratings)
- Promotional campaigns
- Real-time transaction tracking

**Revenue Projection**:
- 500 networks/agents × $150/month = $75,000/month
- 5,000 networks/agents × $150/month = $750,000/month

#### Stream 4: Sponsored Listings & Advertising
**Model**: Pay-per-placement or monthly sponsorship

**Opportunities**:
- Financial services ads (insurance, savings, loans)
- Remittance service promotions
- Mobile wallet promotions
- Airtime/data bundle offers
- Targeted to high-traffic geographic areas

**Implementation**:
- Prominent badge on sponsored agent listings
- Banner ads in app
- Email/push notification sponsorships (opt-in)
- Transparent separation from organic content

**Privacy**: Never use location data to target ads without consent

**Revenue Projection**:
- 20 sponsors × $5,000/month = $100,000/month
- 50 sponsors × $5,000/month = $250,000/month

#### Stream 5: Data & Analytics
**Model**: B2B data licensing

**Customers**:
- Financial institutions (understanding cash-out needs)
- Government agencies (financial inclusion measurement)
- NGOs (humanitarian response)
- Mobile money networks (competitor intelligence)
- Real estate/urban planners (economic mapping)

**Data Products**:
- Geographic demand heatmaps (anonymized)
- Cash availability forecasts
- Network utilization rates
- Seasonal usage patterns
- Financial inclusion metrics

**Pricing**: $1,000 - $50,000/month depending on data access level

**Privacy**: Heavily anonymized, aggregated, compliant with regulations

**Revenue Projection**:
- 10 customers × $5,000/month = $50,000/month
- 50 customers × $5,000/month = $250,000/month

#### Stream 6: White-Label Solutions
**Model**: License the platform to other organizations

**Customers**:
- Mobile money networks (own-branded version)
- Financial service providers
- NGOs (custom deployment)
- Government agencies (financial inclusion programs)

**Pricing**: $2,000 - $20,000/month or one-time license fee

**Revenue Projection**:
- 5 white-label deployments × $5,000/month = $25,000/month
- 20 white-label deployments × $5,000/month = $100,000/month

### 3.2 Combined Revenue Projections

**Scenario: 100,000 Users at Scale**

| Stream | Users/Customers | Unit | Monthly Rate | Monthly Revenue |
|--------|-----------------|------|--------------|-----------------|
| Commission | 100,000 users | $0.80 per user | 4 withdrawals | $32,000 |
| Premium | 5,000 users | $3 | subscription | $15,000 |
| Agent Dashboard | 300 agents | $150 | subscription | $45,000 |
| Advertising | 15 sponsors | $4,000 | sponsorship | $60,000 |
| Data & Analytics | 8 customers | $5,000 | licensing | $40,000 |
| White-Label | 2 deployments | $5,000 | subscription | $10,000 |
| **TOTAL** | - | - | - | **$202,000** |

---

## Part 4: Go-to-Market Strategy

### Phase 1: Foundation (Months 1-3)
1. **Focus**: Transaction commission partnerships
2. **Actions**:
   - Negotiate 1-3 network partnerships
   - Implement commission tracking
   - Optimize user experience
3. **Target**: 1,000 active users, $100-500/day revenue

### Phase 2: Monetization (Months 4-6)
1. **Launch**: Premium subscription
2. **Launch**: Basic agent dashboard
3. **Actions**:
   - Add reviews & ratings system
   - Launch first advertising partnerships
4. **Target**: 5,000 active users, $1,000-3,000/day revenue

### Phase 3: Expansion (Months 7-12)
1. **Launch**: Data products
2. **Expand**: White-label offerings
3. **Enhance**: Real-time status updates
4. **Target**: 50,000+ active users, $5,000+/day revenue

---

## Part 5: Financial Projections (3-Year)

### Year 1
- **Users**: 0 → 50,000
- **Revenue**: $0 → $100,000/month
- **Costs**: Supabase, servers, team (~$20,000/month)
- **Net**: Break-even to positive

### Year 2
- **Users**: 50,000 → 500,000
- **Revenue**: $100,000 → $1,500,000/month
- **Costs**: Infrastructure, sales team (~$200,000/month)
- **Net**: $1,300,000/month profit

### Year 3
- **Users**: 500,000 → 2,000,000
- **Revenue**: $1,500,000 → $5,000,000/month
- **Costs**: Full team, marketing, support (~$500,000/month)
- **Net**: $4,500,000/month profit

---

## Part 6: Competitive Advantages

1. **Network Effect**: More users = more data = better experience
2. **Privacy First**: Never expose individual withdrawals or tracking
3. **Offline Capability**: Works without internet (unique advantage)
4. **Open Data**: Sell aggregated insights while protecting individual privacy
5. **Deep Integration**: Partnerships with networks for direct commission
6. **Emerging Markets Focus**: Tailor UX for low-bandwidth, older devices

---

## Part 7: Risk Mitigation

### Risk: User Privacy Concerns
- **Mitigation**: Transparent privacy policy, no tracking in background, clear consent
- **Compliance**: GDPR-ready, CCPA-compliant, local regulations

### Risk: Network Partnerships Delayed
- **Mitigation**: Start with ads and premium subscription revenue first
- **Fallback**: White-label to NGOs who need this solution

### Risk: User Acquisition Costs Too High
- **Mitigation**: Organic growth through word-of-mouth, partnerships, press
- **Strategy**: Focus on underserved markets with high cash-usage

### Risk: Data Security/Hacking
- **Mitigation**: Regular security audits, bug bounty program, encrypted data
- **Compliance**: SOC 2 certification target

---

## Part 8: Success Metrics (KPIs)

### User Metrics
- Daily Active Users (DAU)
- Monthly Active Users (MAU)
- User retention rate (Day 7, Day 30, Day 90)
- Withdrawal transaction rate per user/month
- Time to find nearest point

### Engagement Metrics
- Average session duration
- Features used per user (search, directions, saved points)
- Rating/review submission rate
- Repeat usage frequency

### Revenue Metrics
- Revenue per active user (RPAU)
- Customer acquisition cost (CAC)
- Lifetime value (LTV)
- LTV:CAC ratio (target: > 3:1)
- Churn rate

### Quality Metrics
- App crash rate
- API response time
- Point accuracy (compared to real-world)
- User satisfaction (NPS score)

---

## Part 9: Implementation Roadmap

### Q1 2025
- ✅ Complete: 100m radius filter, search button, saved points independence
- 🔲 In Progress: Reviews & ratings system
- 🔲 To Do: Finalize payment partnerships

### Q2 2025
- 🔲 Launch: Premium subscription
- 🔲 Launch: Sponsored listings beta
- 🔲 Feature: Real-time status updates

### Q3 2025
- 🔲 Launch: Agent dashboard
- 🔲 Launch: Data API
- 🔲 Feature: Operating hours & services

### Q4 2025
- 🔲 Launch: White-label platform
- 🔲 Feature: Push notifications
- 🔲 Marketing: Paid acquisition campaign

---

## Part 10: Conclusion

Dialy has a clear path to sustainable, profitable growth by:

1. **Starting** with transaction commissions (aligned incentives)
2. **Adding** premium features for power users
3. **Serving** businesses with analytics dashboards
4. **Monetizing** data responsibly with privacy-first approach
5. **Scaling** through partnerships and white-label

The recent technical improvements (100m radius, search button, saved points) improve core UX and set the stage for feature monetization. The business model provides multiple revenue streams to reduce dependence on any single channel.

**Next Steps**:
1. Validate user interest through surveys
2. Begin network partnership negotiations
3. Implement reviews system
4. Launch beta premium subscription
5. Recruit business development team member

---

## Appendix: API Design Examples

### Reviews API
```
POST /api/points/{pointId}/reviews
{
  "rating": 5,
  "comment": "Friendly agent, no queue"
}

GET /api/points/{pointId}/reviews?limit=10&offset=0
```

### Status Updates API
```
POST /api/points/{pointId}/status
{
  "status": "available" | "unavailable" | "busy" | "broken",
  "reason": "System maintenance",
  "expiresIn": 7200 // seconds
}

GET /api/points/{pointId}/status/latest
```

### Analytics API (Agent Dashboard)
```
GET /api/agents/{agentId}/analytics?from=2025-01-01&to=2025-01-31
{
  "views": 4532,
  "withdrawals": 342,
  "avgRating": 4.7,
  "topReasons": ["friendly", "fast", "no queue"],
  "peakHours": ["9-10am", "12-1pm", "5-6pm"]
}
```

