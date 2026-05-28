# Employee Profile API Endpoints

## 1. Activity Feed
**Endpoint:** `GET /api/employees/:id/activity-feed?limit=15`

Returns recent employee actions from service_requests table.

**Query Parameters:**
- `limit` (optional, default: 15) - Number of activities to return

**Response:**
```json
[
  {
    "id": "uuid",
    "type": "deal|object|meeting|call|email|task|achievement",
    "title": "Activity title",
    "description": "Activity description",
    "timestamp": "2026-03-01T10:30:00Z",
    "metadata": { "key": "value" }
  }
]
```

**Frontend Hook:**
```typescript
import { useEmployeeActivityFeed } from '@/hooks/useEmployeeActivityFeed';

const { activities, isLoading, error, refetch } = useEmployeeActivityFeed(employeeId, 15);
```

---

## 2. Monthly Trends
**Endpoint:** `GET /api/employees/:id/monthly-trends?months=12`

Aggregates employee performance by month.

**Query Parameters:**
- `months` (optional, default: 12) - Number of months to include

**Response:**
```json
[
  {
    "month": "2026-02-01T00:00:00Z",
    "efficiency": 85.5,
    "deals": 12,
    "revenue": 150000.00
  }
]
```

**Frontend Hook:**
```typescript
import { useEmployeeMonthlyTrends } from '@/hooks/useEmployeeMonthlyTrends';

const { trends, isLoading, error, refetch } = useEmployeeMonthlyTrends(employeeId, 12);
```

---

## 3. Daily Activity Heatmap
**Endpoint:** `GET /api/employees/:id/daily-activity?days=7`

Returns 2D array of activity counts by day and hour for heatmap visualization.

**Query Parameters:**
- `days` (optional, default: 7) - Number of days to include

**Response:**
```json
[
  [0, 0, 0, 0, 0, 0, 0, 0, 2, 5, 8, 12, 10, 8, 6, 4, 3, 2, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 3, 6, 9, 11, 9, 7, 5, 3, 2, 1, 0, 0, 0, 0, 0, 0]
]
```
Format: `[days][24 hours]` - each number represents activity count for that hour.

**Frontend Hook:**
```typescript
import { useEmployeeDailyActivity } from '@/hooks/useEmployeeDailyActivity';

const { heatmapData, isLoading, error, refetch } = useEmployeeDailyActivity(employeeId, 7);
```

---

## Implementation Details

- All endpoints use authentication middleware (`authenticateToken`)
- Data is queried from `service_requests` table
- Proper error handling with 500 status codes
- TypeScript types provided for frontend integration
- React Query hooks with 60s stale time and 5min cache
