# Role-Based Filtering UI - Integration Guide

## Overview
This guide explains how to integrate the new role-based filtering components into the Deals page.

## Components Created

### 1. RoleBasedFilterBar
**File:** `src/components/Deals/RoleBasedFilterBar.tsx`

Comprehensive filter panel with:
- Year & Month selectors (all users)
- Search by employee name (all users)
- Deal Status filter (МОП/РОП/Directors only)
- Amount range filter (Directors only)
- Expandable advanced filters panel
- Active filter counter badge
- Clear filters button

**Props:**
```typescript
interface RoleBasedFilterBarProps {
  accessLevel: number;
  filters: {
    year: number;
    month: number;
    searchQuery: string;
    dealStatus?: 'all' | 'active' | 'completed' | 'cancelled';
    minAmount?: number;
    maxAmount?: number;
  };
  onFiltersChange: (filters: any) => void;
  currentYear: number;
}
```

**Usage:**
```tsx
<RoleBasedFilterBar
  accessLevel={accessLevel}
  filters={filters}
  onFiltersChange={setFilters}
  currentYear={currentYear}
/>
```

### 2. MyDealsToggle
**File:** `src/components/Deals/MyDealsToggle.tsx`

Toggle between personal and team/all deals.

**Visibility:**
- МОП (50-89): Shows "Мои сделки" / "Сделки команды"
- Directors (90+): Shows "Мои сделки" / "Все сделки"
- Realtors (<50): Hidden

**Props:**
```typescript
interface MyDealsToggleProps {
  isMyDealsOnly: boolean;
  onToggle: (isMyDealsOnly: boolean) => void;
  accessLevel: number;
}
```

**Usage:**
```tsx
<MyDealsToggle
  isMyDealsOnly={isMyDealsOnly}
  onToggle={setIsMyDealsOnly}
  accessLevel={accessLevel}
/>
```

### 3. BranchFilter
**File:** `src/components/Deals/BranchFilter.tsx`

Filter deals by branch (Directors only).

**Visibility:**
- Directors (90+): Visible if branches available
- Others: Hidden

**Props:**
```typescript
interface BranchFilterProps {
  accessLevel: number;
  selectedBranch?: string;
  onBranchChange: (branchId: string | undefined) => void;
  branches?: Array<{ id: string; name: string }>;
  isLoading?: boolean;
}
```

**Usage:**
```tsx
<BranchFilter
  accessLevel={accessLevel}
  selectedBranch={selectedBranch}
  onBranchChange={setSelectedBranch}
  branches={branches}
  isLoading={isLoading}
/>
```

### 4. DealStatusFilter
**File:** `src/components/Deals/DealStatusFilter.tsx`

Quick filter buttons for deal status.

**Visibility:**
- МОП (50-89): Visible
- Directors (90+): Visible
- Realtors (<50): Hidden

**Props:**
```typescript
interface DealStatusFilterProps {
  accessLevel: number;
  selectedStatus: 'all' | 'active' | 'completed' | 'cancelled';
  onStatusChange: (status: 'all' | 'active' | 'completed' | 'cancelled') => void;
}
```

**Usage:**
```tsx
<DealStatusFilter
  accessLevel={accessLevel}
  selectedStatus={dealStatus}
  onStatusChange={setDealStatus}
/>
```

## Integration Steps

### Step 1: Update Deals.tsx State
Add new filter states to the Deals component:

```typescript
const [filters, setFilters] = useState({
  year: currentYear,
  month: 0,
  searchQuery: '',
  dealStatus: 'all' as const,
  minAmount: undefined,
  maxAmount: undefined,
});

const [isMyDealsOnly, setIsMyDealsOnly] = useState(true);
const [selectedBranch, setSelectedBranch] = useState<string | undefined>();
```

### Step 2: Update useDrillDownDeals Hook
Modify the hook to accept additional filter parameters:

```typescript
const { groups, deals, totals, isLoading, refetch } = useDrillDownDeals(
  currentLevel,
  {
    ...currentFilters,
    dealStatus: filters.dealStatus,
    minAmount: filters.minAmount,
    maxAmount: filters.maxAmount,
    branchId: selectedBranch,
    isMyDealsOnly,
  }
);
```

### Step 3: Add Components to Deals Page
Replace the existing filter bar with new components:

```tsx
{/* Role-Based Filters */}
<div className="space-y-4">
  {/* My Deals Toggle - МОП/РОП/Directors */}
  <MyDealsToggle
    isMyDealsOnly={isMyDealsOnly}
    onToggle={setIsMyDealsOnly}
    accessLevel={accessLevel}
  />

  {/* Branch Filter - Directors only */}
  <BranchFilter
    accessLevel={accessLevel}
    selectedBranch={selectedBranch}
    onBranchChange={setSelectedBranch}
    branches={branches}
    isLoading={isLoading}
  />

  {/* Deal Status Filter - МОП/РОП/Directors */}
  <DealStatusFilter
    accessLevel={accessLevel}
    selectedStatus={filters.dealStatus}
    onStatusChange={(status) =>
      setFilters({ ...filters, dealStatus: status })
    }
  />

  {/* Advanced Filter Bar */}
  <RoleBasedFilterBar
    accessLevel={accessLevel}
    filters={filters}
    onFiltersChange={setFilters}
    currentYear={currentYear}
  />
</div>
```

## Access Level Mapping

| Component | Realtor (<30) | МОП (50-89) | Director (90+) |
|-----------|---------------|------------|----------------|
| MyDealsToggle | Hidden | Visible | Visible |
| BranchFilter | Hidden | Hidden | Visible |
| DealStatusFilter | Hidden | Visible | Visible |
| RoleBasedFilterBar | Basic | Extended | Full |

## Filter Logic

### For Realtors (<30)
- Can only see their own deals
- Can filter by: Year, Month, Search
- Cannot filter by: Status, Amount, Branch

### For МОП (50-89)
- Can toggle between personal and team deals
- Can filter by: Year, Month, Search, Status
- Cannot filter by: Amount, Branch

### For Directors (90+)
- Can toggle between personal and all deals
- Can filter by: Year, Month, Search, Status, Amount, Branch
- Full access to all filtering options

## Backend Integration

The backend should accept these query parameters:

```
GET /deal-table/my-deals?year=2026&month=3&dealStatus=active&minAmount=100000&maxAmount=5000000
GET /deal-table/team-deals?year=2026&month=3&dealStatus=completed
GET /deal-table/branch-deals?year=2026&branchId=branch-123&dealStatus=active
```

## Styling Notes

All components use:
- Tailwind CSS with dark theme (zinc-900, white/10, etc.)
- Framer Motion for animations
- shadcn/ui components (Button, Select, Input)
- Consistent spacing and typography
- Responsive design (mobile-first)

## Future Enhancements

1. **Saved Filters:** Allow users to save filter presets
2. **Filter History:** Track recently used filters
3. **Export Filtered Data:** Export filtered deals to CSV/Excel
4. **Advanced Search:** Full-text search across deal fields
5. **Custom Date Range:** Replace month selector with date range picker
