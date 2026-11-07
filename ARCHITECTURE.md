# Dialy Architecture & Technical Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Client (Web/PWA)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           MapScreen.svelte (Main View)                   │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │ MapView (Leaflet)                                   │ │  │
│  │  │ • Displays all visible points on map                │ │  │
│  │  │ • Shows user location (geolocation.fix)             │ │  │
│  │  │ • Renders route line (if directions active)         │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │ MapSearch.svelte (Search Bar)                       │ │  │
│  │  │ • Draft input field for agent code                  │ │  │
│  │  │ • Network filter chips (All, MTN, Orange Money...)  │ │  │
│  │  │ • ✨ NEW: Explicit Search button                    │ │  │
│  │  │ • Applies filter on submit (not on keystroke)       │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │ NearbySheet.svelte (Nearby Points List)             │ │  │
│  │  │ • Collapsible panel at bottom                        │ │  │
│  │  │ • ✨ NEW: Only shows points within 100m radius       │ │  │
│  │  │ • ✨ NEW: Enhanced distance badges with icons        │ │  │
│  │  │ • 20 point limit (NEARBY_LIMIT)                      │ │  │
│  │  │ • Sorted by distance (nearest first)                │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │ PointCard.svelte (Selected Point Details)           │ │  │
│  │  │ • Shows detailed info for selected point            │ │  │
│  │  │ • Withdrawal/Save buttons                           │ │  │
│  │  │ • Directions button                                 │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           SavedList.svelte (Saved Points)               │  │
│  │  • ✨ Shows ALL saved points (no distance limit)         │  │
│  │  • Distance shown as metadata (informational only)      │  │
│  │  • Can navigate to any saved point on map               │  │
│  │  • Last used timestamp displayed                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ (HTTPS REST/RPC)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase Backend                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Authentication         Public Data          User Data           │
│  ┌─────────────────┐   ┌──────────────────┐  ┌─────────────┐   │
│  │ auth.users      │   │ public.points    │  │ withdrawals │   │
│  │ • email         │   │ • id             │  │ • user_id   │   │
│  │ • password_hash │   │ • network_id     │  │ • point_id  │   │
│  │                 │   │ • code           │  │ • amount    │   │
│  │                 │   │ • location (geo) │  │ • location  │   │
│  │                 │   │ • status         │  │ • timestamp │   │
│  │                 │   │ • withdrawal_cnt │  │             │   │
│  │                 │   │ • updated_at     │  │             │   │
│  └─────────────────┘   └──────────────────┘  └─────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Row Level Security (RLS)                       │  │
│  │  ┌─ public.points                                       │  │
│  │  │  SELECT: All authenticated users can read all        │  │
│  │  │          active/hidden points (anonymously)          │  │
│  │  │  UPDATE: Only admins can update point details        │  │
│  │  │                                                       │  │
│  │  └─ public.withdrawals                                  │  │
│  │     SELECT: Each user sees only their own withdrawals   │  │
│  │     INSERT: User creates their own withdrawal records   │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Key RPC Functions                              │  │
│  │  • points_in_bbox() - fetch points in bounding box      │  │
│  │  • nearby_points() - fetch points within radius         │  │
│  │  • my_saved_points() - fetch user's saved points        │  │
│  │  • record_withdrawal() - add withdrawal + point        │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Finding Nearby Points

```
User Opens App
    │
    ├─→ Geolocation request → browser → user grants permission
    │       │
    │       └─→ geolocation.fix = {lat, lng, accuracy}
    │
    ├─→ Sync points for current view bounds
    │       │
    │       └─→ pointsSync.syncArea(bounds)
    │           └─→ fetchPointsPage({bounds, limit: 500})
    │               └─→ Supabase RPC: points_in_bbox()
    │                   └─→ Returns all public active points in bbox
    │
    ├─→ Store locally in IndexedDB
    │       │
    │       └─→ localData.points = CashPoint[]
    │
    ├─→ Apply user filter
    │       │
    │       └─→ visiblePoints = points.filter(matchesFilter)
    │
    ├─→ Calculate nearby points (NEW)
    │       │
    │       ├─→ nearestPoints(visiblePoints, fix, 20, 100)
    │       │
    │       └─→ Returns: [
    │           { point: CashPoint, distanceM: 42 },
    │           { point: CashPoint, distanceM: 67 },
    │           { point: CashPoint, distanceM: 89 },
    │           { point: CashPoint, distanceM: 105 }, ← FILTERED OUT
    │           ...
    │           ]
    │
    └─→ Render NearbySheet
            │
            ├─→ For each point in nearby:
            │       │
            │       └─→ Display badge: "42 m" with location icon
            │
            └─→ If no nearby points: "No points here yet (100m radius)"
```

---

## Data Flow: Search with New Button

```
User Typing in Search Field (BEFORE)
    │
    └─→ oninput event → setCode() → filter.code = "123"
        └─→ Reactive filter immediately applied
            └─→ Map updates in real-time while typing
            └─→ Problem: Accidental filtering

User Typing in Search Field (AFTER - NEW)
    │
    ├─→ oninput event → setCode() → draftCode = "123"
    │   (filter unchanged, no visual update)
    │
    └─→ User clicks "Search" button or presses Enter
        │
        └─→ form onsubmit() → applySearch()
            │
            └─→ filter = { ...filter, code: draftCode }
                │
                └─→ Map updates only after explicit action
                    └─→ Better UX, prevents accidents
```

---

## Key Constants & Configuration

### Nearby Points
```typescript
// MapScreen.svelte
const NEARBY_LIMIT = 20;           // Max 20 points in list
const NEARBY_RADIUS_M = 100;       // Only show within 100m

// Results in: nearestPoints(visiblePoints, geolocation.fix, 20, 100)
```

### Point Sync
```typescript
// points-sync.ts
export const SYNC_CELL_ZOOM = 12;        // Tile zoom level
export const MAX_CELLS_PER_SYNC = 16;    // Max cells per sync
export const CELL_REFRESH_MS = 2*60_000; // Refresh every 2 min
export const PAGE_SIZE = 500;            // Points per RPC call
```

### Search
```typescript
// MapSearch.svelte
const MAX_CODE_LENGTH = 6;  // Max agent code digits
```

---

## Database Schema (Relevant to Points)

```sql
-- Public points table (everyone can read, no ownership)
public.points
├── id (UUID, primary key)
├── network_id (text, FK → networks)
├── code (text, 1-32 digits)
├── location (geography point, 4326)
├── accuracy_m (real, meters)
├── withdrawal_count (int, >= 0)
├── last_withdrawal_at (timestamptz, nullable)
├── status (text: 'active' | 'hidden')
├── created_at (timestamptz)
└── updated_at (timestamptz)

-- Indexes
├── points_location_idx (GiST index for spatial queries)
├── points_updated_at_id_idx (for sync cursor)
└── points_network_code_idx (for code lookup)

-- RLS Policy (applies to all authenticated users)
└── SELECT: (true) → Anyone can see all public points

-- Withdrawal records (private to user)
public.withdrawals
├── id (UUID)
├── user_id (UUID, FK → auth.users)
├── point_id (UUID, FK → points)
├── amount (int)
├── location (geography, where withdrawal happened)
├── accuracy_m (real)
├── captured_at (timestamptz)
├── created_point (bool, if new point was created)
├── counted (bool, if withdrawal was counted for point stats)
└── created_at (timestamptz)

-- RLS Policy
└── SELECT: (auth.uid() = user_id) → Users see only their own
```

---

## Component Dependencies

```
MapScreen.svelte (Main orchestrator)
├── MapView.svelte (Leaflet map display)
│   └── Uses: visiblePoints, fix, selectedId, route
├── MapSearch.svelte (Search + filter)
│   └── Manages: filter (network + code)
│       └── NEW: Draft/applied state separation
├── NearbySheet.svelte (Nearby list)
│   ├── Receives: nearby (filtered NearbyPoint[])
│   └── NEW: Shows only points within 100m
├── PointCard.svelte (Selected point details)
│   └── Receives: selected point
├── DirectionsBanner.svelte (Walking directions)
│   └── Receives: directions state
└── NewWithdrawalSheet.svelte (Withdrawal flow)
    └── Receives: selected point

SavedList.svelte (Independent page)
├── Uses: saved.entries (user's saved point IDs)
├── Maps to: pointsById (local points data)
└── NEW: No distance filtering applied
```

---

## Improved Nearby Points Algorithm

```typescript
// OLD: Get nearest 20 points (could be far away)
export function nearestPoints(
  points: readonly CashPoint[],
  origin: LatLng,
  limit: number
): NearbyPoint[] {
  return points
    .map((point) => ({ point, distanceM: distanceMeters(origin, point) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}

// NEW: Get nearest 20 points within specified radius
export function nearestPoints(
  points: readonly CashPoint[],
  origin: LatLng,
  limit: number,
  radiusM?: number  // Optional: filter to radius
): NearbyPoint[] {
  return points
    .map((point) => ({ point, distanceM: distanceMeters(origin, point) }))
    .filter((item) => radiusM === undefined || item.distanceM <= radiusM)  // NEW
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}

// Usage
nearestPoints(points, {lat, lng}, 20)        // OLD: no radius
nearestPoints(points, {lat, lng}, 20, 100)   // NEW: 100m radius
```

**Time Complexity**:
- Mapping distances: O(n)
- Filtering (new): O(n)
- Sorting: O(n log n)
- **Total**: O(n log n), unchanged

**Space Complexity**:
- NearbyPoint array: O(k) where k = points within radius (usually << n)
- Improvement: Filter before sort reduces sort work from O(n log n) to O(k log k)

---

## Message Localization

### English (en.json)
```json
{
  "map_search_label": "Search by agent code",
  "map_search_placeholder": "Agent code",
  "map_search_clear": "Clear search",
  "map_search_submit": "Search"  // NEW
}
```

### French (fr.json)
```json
{
  "map_search_label": "Rechercher par code agent",
  "map_search_placeholder": "Code agent",
  "map_search_clear": "Effacer la recherche",
  "map_search_submit": "Rechercher"  // NEW
}
```

---

## Privacy & Security Model

### What Users See
✅ All public cash points (network, code, location, rating, usage frequency)
✅ Their own withdrawal history
✅ Their own saved points

### What Users Don't See
❌ Who withdrew at each point (anonymized)
❌ Other users' withdrawal history
❌ Other users' locations
❌ Payment details (PIN, amounts of others)

### What's Publicly Available
✅ Aggregated statistics (# of withdrawals, last withdrawal time)
✅ Point locations on map
✅ Point ratings & reviews (future)

### Row Level Security
- **Points**: Everyone can READ all active/hidden points
- **Withdrawals**: Only user can READ their own withdrawals
- **Saved Points**: Only user can READ/WRITE their saved list

---

## Future Architecture Considerations

### Phase 2: Reviews & Ratings
```
PointCard.svelte
├── Display: Average rating (4.7★)
├── Display: Review count (234 reviews)
├── Button: "Read reviews" → ReviewSheet.svelte
│   ├── List: All reviews sorted by helpful
│   ├── Form: "Add your review"
│   └── Filter: By rating, date, helpfulness
└── Component: RatingBadge.svelte

Database:
public.point_reviews
├── id
├── point_id
├── user_id
├── rating (1-5)
├── comment
├── helpful_count
└── created_at
```

### Phase 3: Real-Time Status
```
NearbySheet.svelte
├── Display: Distance badge
├── NEW: Status badge "Available", "Busy", "Broken"
│   └── Color-coded (green, yellow, red)
│   └── Timestamp: "2 min ago"
│   └── Expires after 2 hours
└── Refresh: Auto-updates every 30 seconds

Database:
public.point_status_updates
├── id
├── point_id
├── user_id
├── status (available|unavailable|busy|broken)
├── reason
├── reported_at
└── expires_at
```

### Phase 4: Agent Dashboard
```
Agent Portal (separate app)
├── Login: Agent credentials
├── Dashboard:
│   ├── Analytics: Views, withdrawals, trends
│   ├── Reviews: Read, respond, manage
│   ├── Settings: Hours, services, info
│   └── Notifications: New reviews, mentions
└── API: `/api/agents/{agentId}/analytics`
```

---

## Performance Optimizations

### Current
- ✅ Spatial index on `points.location` (GiST)
- ✅ Sync cursor index on `points.updated_at, id`
- ✅ Local IndexedDB caching (offline works)
- ✅ Filtered results before sorting (reduced sort work)

### Recommended Future
- 📋 Vector search for semantic point finding
- 📋 Redis caching for popular areas
- 📋 CDN for tile assets
- 📋 Service worker for offline maps
- 📋 Lazy loading of point details

---

## Testing Strategy

### Unit Tests
```typescript
// tests/domain/points.test.ts
test('nearestPoints respects radius parameter', () => {
  const points = [
    {id: '1', lat: 0, lng: 0},
    {id: '2', lat: 0.001, lng: 0},  // ~111m
    {id: '3', lat: 0.002, lng: 0},  // ~222m
  ];
  const result = nearestPoints(points, {lat: 0, lng: 0}, 10, 100);
  expect(result).toHaveLength(1);
  expect(result[0].point.id).toBe('1');
});

// tests/features/map/MapSearch.test.ts
test('search applies filter only on submit', () => {
  // Type → draftCode updated, filter unchanged
  // Click search → filter applied
});
```

### E2E Tests
```typescript
// e2e/map.spec.ts
test('nearby points limited to 100m radius', async ({ page }) => {
  await page.goto('/');
  await page.click('[aria-label="Allow location"]');
  const nearby = await page.locator('[role="listitem"]');
  // Verify all distances ≤ 100m
});
```

---

## Summary

The Dialy platform provides:
1. **Privacy-First**: No user tracking, points anonymized
2. **Offline-First**: Works without internet, syncs later
3. **Real-Time**: Live point updates as users withdraw
4. **Actionable**: Search, save, get directions to points
5. **Community-Driven**: Crowdsourced locations improve over time

Recent improvements:
- ✅ 100m radius filter for "nearby" points
- ✅ Explicit search button (prevents accidents)
- ✅ Enhanced distance display (visual hierarchy)
- ✅ Saved points independence (full history access)

Next steps: See IMPROVEMENTS_AND_BUSINESS_MODEL.md

