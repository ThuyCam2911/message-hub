'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  Cell,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Eye,
  Megaphone,
  MousePointerClick,
  Send,
  Trophy,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { cn } from '../../lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Separator } from '../../components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../../components/ui/chart';
import { TimeRangePicker, type TimeRange } from '../../components/time-range-picker';
import { ChannelOverviewTab } from './channel-overview-tab';
import {
  type CampaignRow,
  type CampaignType,
  type StatusFilter,
  type Summary,
  type TypeFilter,
  compactNumber,
  effectiveType,
  formatDate,
  pct,
  statusMeta,
  typeMeta,
} from './types';

// ---------- Static config ----------

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả loại' },
  { key: 'voucher', label: 'Voucher' },
  { key: 'loyalty', label: 'Loyalty' },
  { key: 'reward', label: 'Reward' },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả trạng thái' },
  { key: 'draft', label: 'Nháp' },
  { key: 'scheduled', label: 'Đã lên lịch' },
  { key: 'running', label: 'Đang chạy' },
  { key: 'completed', label: 'Hoàn tất' },
];

const TYPE_CHART_CONFIG: ChartConfig = {
  voucher: { label: 'Voucher', color: 'hsl(var(--chart-1))' },
  loyalty: { label: 'Loyalty', color: 'hsl(var(--chart-2))' },
  reward: { label: 'Reward', color: 'hsl(var(--chart-3))' },
  other: { label: 'Khác', color: 'hsl(var(--chart-5))' },
};

const TREND_CHART_CONFIG: ChartConfig = {
  sent: { label: 'Đã gửi', color: 'hsl(var(--chart-1))' },
  opened: { label: 'Đã mở', color: 'hsl(var(--chart-2))' },
  clicked: { label: 'Đã click', color: 'hsl(var(--chart-3))' },
};

const STATUS_COLOR_VAR: Record<string, string> = {
  draft: 'hsl(var(--chart-5))',
  scheduled: 'hsl(var(--chart-4))',
  running: 'hsl(var(--chart-2))',
  completed: 'hsl(var(--chart-1))',
};

function statusChartConfig(statuses: string[]): ChartConfig {
  const cfg: ChartConfig = {};
  statuses.forEach((s) => {
    cfg[s] = { label: statusMeta(s).label, color: STATUS_COLOR_VAR[s] ?? 'hsl(var(--chart-5))' };
  });
  return cfg;
}

type SortKey = 'sent' | 'deliveryRate' | 'openRate' | 'clickRate';
type SortDir = 'asc' | 'desc';

function buildQuery(typeFilter: TypeFilter, statusFilter: StatusFilter, range: TimeRange): string {
  const params = new URLSearchParams();
  if (typeFilter !== 'all') params.set('campaignType', typeFilter);
  if (statusFilter !== 'all') params.set('status', statusFilter);
  if (range.from) params.set('from', range.from.toISOString());
  if (range.to) params.set('to', range.to.toISOString());
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ---------- Bespoke tooltips (kept as small components, styled with the same
// tokens as shadcn's ChartTooltipContent, for the two charts whose payload
// shape — per-category dual bars, per-campaign scatter points — doesn't map
// cleanly onto ChartTooltipContent's single-series-per-dataKey lookup) ----------

function TypeBreakdownTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number; payload: { campaignType: CampaignType } }[];
}) {
  if (!active || !payload || !payload.length) return null;
  const type = payload[0]?.payload?.campaignType;
  const meta = type ? typeMeta(type) : null;
  const names: Record<string, string> = { openRate: 'Open rate', clickRate: 'Click rate' };
  return (
    <div className="grid min-w-[9rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{meta?.label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: meta?.color, opacity: p.dataKey === 'clickRate' ? 0.55 : 1 }}
            />
            {names[p.dataKey] ?? p.dataKey}
          </span>
          <span className="font-mono font-medium tabular-nums">{pct(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: CampaignRow }[];
}) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const meta = typeMeta(row.campaignType);
  return (
    <div className="grid min-w-[12rem] gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="flex items-center gap-1.5 font-medium">
        <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: meta.color }} />
        {row.name}
      </div>
      <div className="flex items-center justify-between gap-3 text-muted-foreground">
        <span>Open rate</span>
        <span className="font-mono font-medium tabular-nums text-foreground">{pct(row.openRate)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-muted-foreground">
        <span>Click rate</span>
        <span className="font-mono font-medium tabular-nums text-foreground">{pct(row.clickRate)}</span>
      </div>
    </div>
  );
}

// ---------- KPI card ----------

function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: 'green' | 'orange';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={cn(
            'mb-2.5 flex h-8 w-8 items-center justify-center rounded-[10px] text-white',
            accent === 'green' ? 'bg-[image:var(--gz-gradient-green)]' : 'bg-[image:var(--gz-gradient-orange)]'
          )}
        >
          {icon}
        </div>
        <div className="text-xs font-semibold text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <TableHead>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onSort(sortKey)}
        className="-ml-3 h-7 gap-1 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        {label}
        {active ? (
          dir === 'desc' ? (
            <ArrowDown className="size-3.5" />
          ) : (
            <ArrowUp className="size-3.5" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 opacity-40" />
        )}
      </Button>
    </TableHead>
  );
}

export default function CampaignInsightsPage() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>({ preset: 'all', from: null, to: null });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('clickRate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const fromTime = timeRange.from?.getTime() ?? null;
  const toTime = timeRange.to?.getTime() ?? null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = buildQuery(typeFilter, statusFilter, timeRange);
        const [s, c] = await Promise.all([
          api.get<Summary>(`/analytics/campaigns/summary${qs}`),
          api.get<CampaignRow[]>(`/analytics/campaigns${qs}`),
        ]);
        if (cancelled) return;
        setSummary(s);
        setCampaigns(c);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, statusFilter, fromTime, toTime]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sortedCampaigns = useMemo(() => {
    const rows = [...campaigns];
    rows.sort((a, b) => (a[sortKey] - b[sortKey]) * (sortDir === 'asc' ? 1 : -1));
    return rows.slice(0, 10);
  }, [campaigns, sortKey, sortDir]);

  const funnelStages = useMemo(() => {
    if (!summary) return [];
    const t = summary.totals;
    const stages = [
      { key: 'sent', label: 'Đã gửi', value: t.sent },
      { key: 'delivered', label: 'Đã giao', value: t.delivered },
      { key: 'opened', label: 'Đã mở', value: t.opened },
      { key: 'clicked', label: 'Đã click', value: t.clicked },
    ];
    const max = stages[0]?.value || 1;
    const ramp = ['hsl(var(--chart-1))', 'hsl(var(--chart-1) / 0.8)', 'hsl(var(--chart-1) / 0.6)', 'hsl(var(--chart-1) / 0.4)'];
    return stages.map((s, i) => ({
      ...s,
      pctOfMax: max > 0 ? s.value / max : 0,
      pctOfPrev: i === 0 ? null : stages[i - 1].value > 0 ? s.value / stages[i - 1].value : 0,
      color: ramp[i],
    }));
  }, [summary]);

  const statusConfig = useMemo(
    () => statusChartConfig((summary?.byStatus ?? []).map((s) => s.status)),
    [summary]
  );

  const spotlight = useMemo(() => {
    if (campaigns.length === 0) return null;
    const eligible = campaigns.filter((c) => c.sent > 0);
    if (eligible.length === 0) return null;
    const best = [...eligible].sort((a, b) => b.clickRate - a.clickRate)[0];
    const worst = [...eligible].sort((a, b) => a.deliveryRate - b.deliveryRate)[0];
    return { best, worst };
  }, [campaigns]);

  const hasFirstLoad = summary !== null;

  return (
    <div>
      <div className="mb-5">
        <h1>Analytics</h1>
        <p className="muted" style={{ margin: 0 }}>
          Hiệu quả chiến dịch &amp; tình trạng gửi tin đa kênh
        </p>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList className="mb-6">
          <TabsTrigger value="campaigns">Campaign Insights</TabsTrigger>
          <TabsTrigger value="channels">Channels &amp; Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
      <div className="mb-5 flex flex-wrap items-end justify-end gap-4">
        <TimeRangePicker value={timeRange} onChange={setTimeRange} />
      </div>

      {error && <p className="error">{error}</p>}

      <div className="mb-6 flex flex-wrap items-center gap-2.5">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger className="h-9 w-[168px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map((f) => (
              <SelectItem key={f.key} value={f.key}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-9 w-[176px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.key} value={f.key}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!hasFirstLoad && !error && (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
      )}

      {hasFirstLoad && (
        <div className={cn('transition-opacity duration-200', loading && 'pointer-events-none opacity-50')}>
          {/* ---------- KPI row ---------- */}
          <div className="mb-7 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard icon={<Megaphone className="size-4" />} label="Tổng chiến dịch" value={compactNumber(summary!.totals.campaigns)} accent="green" />
            <KpiCard icon={<Send className="size-4" />} label="Tổng lượt gửi" value={compactNumber(summary!.totals.sent)} accent="green" />
            <KpiCard icon={<CheckCircle2 className="size-4" />} label="Tỷ lệ giao thành công" value={pct(summary!.totals.deliveryRate)} accent="green" />
            <KpiCard icon={<Eye className="size-4" />} label="Tỷ lệ mở trung bình" value={pct(summary!.totals.openRate)} accent="orange" />
            <KpiCard icon={<MousePointerClick className="size-4" />} label="Tỷ lệ click trung bình" value={pct(summary!.totals.clickRate)} accent="orange" />
          </div>

          {/* ---------- Breakdown by type + Breakdown by status ---------- */}
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[0.92rem]">So sánh theo loại chiến dịch</CardTitle>
                <CardDescription>Open rate &amp; click rate — Voucher / Loyalty / Reward</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={TYPE_CHART_CONFIG} className="aspect-auto h-[260px] w-full">
                  <BarChart data={summary!.byType} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={4}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="campaignType"
                      tickFormatter={(v: CampaignType) => typeMeta(v).label}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <Tooltip content={<TypeBreakdownTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
                    <Bar dataKey="openRate" radius={[4, 4, 0, 0]} maxBarSize={28} name="Open rate" isAnimationActive={false}>
                      {summary!.byType.map((entry) => (
                        <Cell key={`open-${entry.campaignType}`} fill={typeMeta(entry.campaignType).color} />
                      ))}
                    </Bar>
                    <Bar dataKey="clickRate" radius={[4, 4, 0, 0]} maxBarSize={28} name="Click rate" isAnimationActive={false}>
                      {summary!.byType.map((entry) => (
                        <Cell key={`click-${entry.campaignType}`} fill={typeMeta(entry.campaignType).color} fillOpacity={0.5} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
                <div className="mt-2 flex items-center justify-center gap-5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'hsl(var(--muted-foreground))' }} />
                    Open rate (đậm)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[3px] opacity-50" style={{ background: 'hsl(var(--muted-foreground))' }} />
                    Click rate (nhạt)
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[0.92rem]">Phân bổ theo trạng thái</CardTitle>
                <CardDescription>Số chiến dịch theo từng trạng thái vòng đời</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={statusConfig} className="aspect-auto h-[260px] w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="status" hideLabel />} />
                    <Pie
                      data={summary!.byStatus}
                      dataKey="campaigns"
                      nameKey="status"
                      innerRadius={56}
                      outerRadius={92}
                      strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {summary!.byStatus.map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLOR_VAR[entry.status] ?? 'hsl(var(--chart-5))'} />
                      ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent nameKey="status" />} />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          {/* ---------- Funnel + Scatter ---------- */}
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[0.92rem]">Funnel chuyển đổi</CardTitle>
                <CardDescription>Gửi → Giao → Mở → Click</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3.5 pb-1 pt-1">
                  {funnelStages.map((s) => (
                    <div className="flex items-center gap-3.5" key={s.key}>
                      <div className="w-[74px] shrink-0 text-right text-xs font-semibold text-muted-foreground">{s.label}</div>
                      <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted">
                        <div
                          className="h-full rounded-md transition-[width] duration-500"
                          style={{ width: `${Math.max(s.pctOfMax * 100, 2)}%`, background: s.color }}
                        />
                      </div>
                      <div className="w-[108px] shrink-0 text-sm font-bold tabular-nums">
                        {compactNumber(s.value)}
                        {s.pctOfPrev !== null && (
                          <span className="ml-1.5 text-xs font-medium text-muted-foreground">{pct(s.pctOfPrev)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[0.92rem]">Tương quan mở &amp; click</CardTitle>
                <CardDescription>Mỗi điểm là 1 chiến dịch — open rate (x) vs click rate (y)</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={TYPE_CHART_CONFIG} className="aspect-auto h-[260px] w-full">
                  <ScatterChart margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      dataKey="openRate"
                      name="Open rate"
                      tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      tickLine={false}
                    />
                    <YAxis
                      type="number"
                      dataKey="clickRate"
                      name="Click rate"
                      tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <ZAxis range={[64, 64]} />
                    <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3', stroke: 'hsl(var(--border))' }} />
                    {(['voucher', 'loyalty', 'reward', 'other'] as CampaignType[]).map((t) => {
                      const group = campaigns.filter((c) => effectiveType(c.campaignType) === t);
                      if (group.length === 0) return null;
                      return (
                        <Scatter
                          key={t}
                          data={group}
                          fill={typeMeta(t).color}
                          name={typeMeta(t).label}
                          isAnimationActive={false}
                        />
                      );
                    })}
                  </ScatterChart>
                </ChartContainer>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
                  {(['voucher', 'loyalty', 'reward'] as CampaignType[]).map((t) => (
                    <span className="flex items-center gap-1.5" key={t}>
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: typeMeta(t).color }} />
                      {typeMeta(t).label}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ---------- Trend ---------- */}
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-[0.92rem]">Xu hướng theo thời gian</CardTitle>
              <CardDescription>Lượt gửi / mở / click theo ngày (theo thời điểm gửi thật)</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={TREND_CHART_CONFIG} className="aspect-auto h-[280px] w-full">
                <ComposedChart data={summary!.trend} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={44} />
                  <ChartTooltip
                    content={<ChartTooltipContent labelFormatter={(v) => new Date(v as string).toLocaleDateString('vi-VN')} />}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area
                    type="monotone"
                    dataKey="sent"
                    stroke="hsl(var(--chart-1))"
                    fill="hsl(var(--chart-1))"
                    fillOpacity={0.1}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="opened"
                    stroke="hsl(var(--chart-2))"
                    fill="hsl(var(--chart-2))"
                    fillOpacity={0.1}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="clicked"
                    stroke="hsl(var(--chart-3))"
                    fill="hsl(var(--chart-3))"
                    fillOpacity={0.14}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* ---------- Spotlight ---------- */}
          {spotlight && (
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <Card className="border-[hsl(var(--chart-1)/0.35)] bg-[hsl(var(--chart-1)/0.05)]">
                <CardContent className="flex items-start gap-3.5 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[image:var(--gz-gradient-green)] text-white">
                    <Trophy className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-muted-foreground">Chiến dịch xuất sắc nhất</div>
                    <div className="truncate text-base font-bold">{spotlight.best.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Click rate <b className="text-foreground">{pct(spotlight.best.clickRate)}</b>
                      </span>
                      <span>
                        Open rate <b className="text-foreground">{pct(spotlight.best.openRate)}</b>
                      </span>
                      <Badge variant="secondary" className="font-semibold" style={{ color: typeMeta(spotlight.best.campaignType).color }}>
                        {typeMeta(spotlight.best.campaignType).label}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.05)]">
                <CardContent className="flex items-start gap-3.5 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                    <AlertTriangle className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-muted-foreground">Cần chú ý</div>
                    <div className="truncate text-base font-bold">{spotlight.worst.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Delivery rate <b className="text-foreground">{pct(spotlight.worst.deliveryRate)}</b>
                      </span>
                      <span>
                        Gửi <b className="text-foreground">{compactNumber(spotlight.worst.sent)}</b>
                      </span>
                      <Badge variant="secondary" className="font-semibold" style={{ color: typeMeta(spotlight.worst.campaignType).color }}>
                        {typeMeta(spotlight.worst.campaignType).label}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Separator className="my-6" />

          {/* ---------- Top campaigns table ---------- */}
          <h2>Top chiến dịch</h2>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên chiến dịch</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <SortHeader label="Gửi" sortKey="sent" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortHeader label="Delivery rate" sortKey="deliveryRate" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortHeader label="Open rate" sortKey="openRate" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortHeader label="Click rate" sortKey="clickRate" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCampaigns.map((c) => {
                    const meta = typeMeta(c.campaignType);
                    const sMeta = statusMeta(c.status);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="max-w-[220px] truncate font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-semibold" style={{ color: meta.color }}>
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-semibold" style={{ color: sMeta.color, borderColor: sMeta.color }}>
                            {sMeta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">{compactNumber(c.sent)}</TableCell>
                        <TableCell>
                          <RateCell value={c.deliveryRate} color={meta.color} />
                        </TableCell>
                        <TableCell>
                          <RateCell value={c.openRate} color={meta.color} />
                        </TableCell>
                        <TableCell>
                          <RateCell value={c.clickRate} color={meta.color} opacity={0.65} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {sortedCampaigns.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="muted text-center">
                        Không có chiến dịch nào khớp bộ lọc.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
        </TabsContent>

        <TabsContent value="channels">
          <ChannelOverviewTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RateCell({ value, color, opacity = 1 }: { value: number; color: string; opacity?: number }) {
  return (
    <div className="flex min-w-[110px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(value * 100, 100)}%`, background: color, opacity }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums">{pct(value)}</span>
    </div>
  );
}
