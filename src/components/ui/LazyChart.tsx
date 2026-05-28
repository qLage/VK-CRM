import { lazy, Suspense } from 'react';

// Lazy load recharts to reduce initial bundle size
const ChartContainer = lazy(() => import('./chart').then(m => ({ default: m.ChartContainer })));
const ChartTooltip = lazy(() => import('./chart').then(m => ({ default: m.ChartTooltip })));
const ChartTooltipContent = lazy(() => import('./chart').then(m => ({ default: m.ChartTooltipContent })));
const ChartLegend = lazy(() => import('./chart').then(m => ({ default: m.ChartLegend })));
const ChartLegendContent = lazy(() => import('./chart').then(m => ({ default: m.ChartLegendContent })));

// Loading fallback for charts
const ChartLoader = () => (
  <div className="flex items-center justify-center h-full w-full">
    <div className="animate-pulse text-muted-foreground">Загрузка графика...</div>
  </div>
);

// Wrapper components with Suspense
export const LazyChartContainer = (props: any) => (
  <Suspense fallback={<ChartLoader />}>
    <ChartContainer {...props} />
  </Suspense>
);

export const LazyChartTooltip = (props: any) => (
  <Suspense fallback={null}>
    <ChartTooltip {...props} />
  </Suspense>
);

export const LazyChartTooltipContent = (props: any) => (
  <Suspense fallback={null}>
    <ChartTooltipContent {...props} />
  </Suspense>
);

export const LazyChartLegend = (props: any) => (
  <Suspense fallback={null}>
    <ChartLegend {...props} />
  </Suspense>
);

export const LazyChartLegendContent = (props: any) => (
  <Suspense fallback={null}>
    <ChartLegendContent {...props} />
  </Suspense>
);
