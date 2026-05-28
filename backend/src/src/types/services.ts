// Common service types

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  metadata?: Record<string, any>;
}

export interface KpiMetric {
  name: string;
  value: number;
  target: number;
  unit: string;
  period: string;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface UserStats {
  userId: string;
  totalDeals: number;
  totalRevenue: number;
  planCompletion: number;
  rating: number;
}

export interface TeamStats {
  teamId: string;
  teamName: string;
  memberCount: number;
  totalRevenue: number;
  planCompletion: number;
}

export interface BranchStats {
  branchId: string;
  branchName: string;
  teamCount: number;
  employeeCount: number;
  totalRevenue: number;
  planCompletion: number;
}
