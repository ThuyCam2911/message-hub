'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { CheckCircle2, Eye, Megaphone, MousePointerClick } from 'lucide-react';
import { api } from '../../lib/api-client';
import { hasRole } from '../../lib/auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../../components/ui/chart';
import { TimeRangePicker, type TimeRange } from '../../components/time-range-picker';

interface Campaign {
  id: string;
  name: string;
  status: string;
  campaignType: string;
  templateId: string;
  failoverPolicyId: string;
  startDate: string | null;
  endDate: string | null;
  progress: {
    total: number;
    delivered: number;
    failed: number;
    inProgress: number;
    openRate: number;
    clickRate: number;
  };
}

interface CampaignMessageRequest {
  id: string;
  status: string;
  contactId: string;
  contactName: string;
  finalChannelStrategyId?: string;
  channelName?: string;
  currentStepOrder?: number;
  createdAt: string;
  completedAt?: string;
  firstSentAt?: string;
  lastUpdatedAt: string;
  firstOpenedAt?: string;
  firstClickedAt?: string;
  totalClicks: number;
}

interface Attempt {
  id: string;
  channelStrategyId: string;
  status: string;
  errorCode?: string;
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
}
interface Policy {
  id: string;
  name: string;
}
interface Contact {
  id: string;
  displayName: string;
}

interface AnalyticsSummary {
  totals: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
  };
  trend: { date: string; sent: number; delivered: number; opened: number; clicked: number }[];
}

const TERMINAL_STATUSES = new Set(['delivered', 'failed', 'cancelled']);

const TREND_CHART_CONFIG: ChartConfig = {
  delivered: { label: 'Delivered', color: 'hsl(var(--chart-1))' },
  opened: { label: 'Opened', color: 'hsl(var(--chart-2))' },
  clicked: { label: 'Clicked', color: 'hsl(var(--chart-3))' },
};

function Badge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function formatDate(d?: string | null): string {
  if (!d) return '-';
  return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function KpiTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-[10px] bg-[image:var(--gz-gradient-green)] text-white">
          {icon}
        </div>
        <div className="text-xs font-semibold text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const canManage = hasRole('admin', 'operator');

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [requests, setRequests] = useState<CampaignMessageRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, Attempt[]>>({});

  // ---------- Overview ----------
  const [overviewRange, setOverviewRange] = useState<TimeRange>({ preset: 'all', from: null, to: null });
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  // ---------- Config: campaign info + audience/trigger ----------
  const [templates, setTemplates] = useState<Template[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [editName, setEditName] = useState('');
  const [editTemplateId, setEditTemplateId] = useState('');
  const [editPolicyId, setEditPolicyId] = useState('');
  const configInitialized = useRef(false);
  const [allContacts, setAllContacts] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

  // ---------- Config: test-send ----------
  const [testPhone, setTestPhone] = useState('');
  const [testVariables, setTestVariables] = useState('{"name":"Chị Lan","code":"123456"}');
  const [testError, setTestError] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testRequest, setTestRequest] = useState<{ id: string; status: string; attempts: Attempt[] } | null>(null);
  const testPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------- Message / Job tab search ----------
  const [messageSearch, setMessageSearch] = useState('');
  const [jobSearch, setJobSearch] = useState('');

  function stopTestPolling() {
    if (testPollRef.current) {
      clearInterval(testPollRef.current);
      testPollRef.current = null;
    }
  }
  useEffect(() => stopTestPolling, []);

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    setTestError(null);
    setTestRequest(null);
    stopTestPolling();
    setTestSending(true);
    try {
      const templateVariables = JSON.parse(testVariables || '{}');
      const created = await api.post<{ id: string }>(`/campaigns/${id}/send-test`, {
        phone: testPhone,
        templateVariables,
      });

      async function poll() {
        const full = await api.get<{ id: string; status: string; attempts: Attempt[] }>(
          `/message-requests/${created.id}`,
        );
        setTestRequest(full);
        if (TERMINAL_STATUSES.has(full.status)) stopTestPolling();
      }
      await poll();
      testPollRef.current = setInterval(poll, 2000);
    } catch (e) {
      setTestError((e as Error).message);
    } finally {
      setTestSending(false);
    }
  }

  async function load() {
    try {
      const [c, r] = await Promise.all([
        api.get<Campaign>(`/campaigns/${id}`),
        api.get<CampaignMessageRequest[]>(`/campaigns/${id}/message-requests`),
      ]);
      setCampaign(c);
      setRequests(r);
      if (!configInitialized.current) {
        setEditName(c.name);
        setEditTemplateId(c.templateId);
        setEditPolicyId(c.failoverPolicyId);
        configInitialized.current = true;
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    Promise.all([
      api.get<Template[]>('/templates'),
      api.get<Policy[]>('/failover-policies'),
      api.get<Contact[]>('/contacts'),
    ])
      .then(([t, p, c]) => {
        setTemplates(t);
        setPolicies(p);
        setContacts(c);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ campaignId: id });
    if (overviewRange.from) params.set('from', overviewRange.from.toISOString());
    if (overviewRange.to) params.set('to', overviewRange.to.toISOString());
    api
      .get<AnalyticsSummary>(`/analytics/campaigns/summary?${params.toString()}`)
      .then(setAnalytics)
      .catch((e) => setError((e as Error).message));
  }, [id, overviewRange]);

  async function toggleExpand(requestId: string) {
    if (expandedId === requestId) {
      setExpandedId(null);
      return;
    }
    try {
      const full = await api.get<{ attempts: Attempt[] }>(`/message-requests/${requestId}`);
      setDetail((prev) => ({ ...prev, [requestId]: full.attempts }));
      setExpandedId(requestId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.patch(`/campaigns/${id}`, {
        name: editName,
        templateId: editTemplateId,
        failoverPolicyId: editPolicyId,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function toggleContact(contactId: string) {
    setSelectedContacts((prev) => (prev.includes(contactId) ? prev.filter((c) => c !== contactId) : [...prev, contactId]));
  }

  async function triggerSend() {
    setError(null);
    try {
      await api.post(`/campaigns/${id}/trigger`, {
        allContacts,
        contactIds: allContacts ? undefined : selectedContacts,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!campaign) {
    return (
      <div>
        <Link href="/campaigns">&larr; Campaigns</Link>
        {error && <p className="error">{error}</p>}
        {!error && <p className="muted">Đang tải...</p>}
      </div>
    );
  }

  const isDraft = campaign.status === 'draft';
  const filteredMessages = requests.filter(
    (r) => !messageSearch.trim() || r.contactName.toLowerCase().includes(messageSearch.trim().toLowerCase()),
  );
  const filteredJobs = requests.filter(
    (r) => !jobSearch.trim() || r.contactName.toLowerCase().includes(jobSearch.trim().toLowerCase()),
  );

  return (
    <div>
      <Link href="/campaigns" className="muted" style={{ textDecoration: 'none' }}>
        &larr; Campaigns
      </Link>
      <h1 style={{ marginTop: '0.4rem', marginBottom: '0.35rem' }}>{campaign.name}</h1>
      <span className={`badge badge-${campaign.status === 'running' ? 'in_progress' : campaign.status}`}>
        {campaign.status}
      </span>{' '}
      <span className={`badge badge-type-${campaign.campaignType}`}>{campaign.campaignType}</span>
      {error && <p className="error">{error}</p>}

      <Tabs defaultValue="overview" className="mt-4">
        <TabsList className="mb-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="message">Message</TabsTrigger>
          <TabsTrigger value="job">Job</TabsTrigger>
        </TabsList>

        {/* ---------- Overview ---------- */}
        <TabsContent value="overview">
          <div className="mb-4 flex justify-end">
            <TimeRangePicker value={overviewRange} onChange={setOverviewRange} />
          </div>

          <div className="mb-2 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <KpiTile icon={<Megaphone className="size-4" />} label="Targeted User" value={String(campaign.progress.total)} />
            <KpiTile
              icon={<CheckCircle2 className="size-4" />}
              label="Delivered Rate"
              value={pct(analytics?.totals.deliveryRate ?? 0)}
            />
            <KpiTile icon={<Eye className="size-4" />} label="Open Rate" value={pct(analytics?.totals.openRate ?? 0)} />
            <KpiTile
              icon={<MousePointerClick className="size-4" />}
              label="Click Rate"
              value={pct(analytics?.totals.clickRate ?? 0)}
            />
          </div>
          <p className="muted" style={{ marginBottom: '1.5rem' }}>
            {campaign.progress.delivered} delivered, {campaign.progress.failed} failed, {campaign.progress.inProgress}{' '}
            đang xử lý.
          </p>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[0.92rem]">Engagement over time</CardTitle>
              <CardDescription>Delivered / Opened / Clicked theo ngày</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={TREND_CHART_CONFIG} className="aspect-auto h-[280px] w-full">
                <ComposedChart data={analytics?.trend ?? []} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v: string) => new Date(v).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={40} />
                  <ChartTooltip
                    content={<ChartTooltipContent labelFormatter={(v) => new Date(v as string).toLocaleDateString('vi-VN')} />}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area
                    type="monotone"
                    dataKey="delivered"
                    stroke="hsl(var(--chart-1))"
                    fill="hsl(var(--chart-1))"
                    fillOpacity={0.1}
                    strokeWidth={2}
                    dot={false}
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
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Config ---------- */}
        <TabsContent value="config">
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-[0.92rem]">Campaign Information</CardTitle>
              <CardDescription>{isDraft ? 'Có thể sửa khi campaign còn ở trạng thái draft.' : 'Campaign đã trigger — không thể sửa nữa.'}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveConfig}>
                <label>
                  Campaign name
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={!isDraft || !canManage} required />
                </label>
                <label>
                  Template
                  <select value={editTemplateId} onChange={(e) => setEditTemplateId(e.target.value)} disabled={!isDraft || !canManage} required>
                    <option value="">-- select --</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Failover policy
                  <select value={editPolicyId} onChange={(e) => setEditPolicyId(e.target.value)} disabled={!isDraft || !canManage} required>
                    <option value="">-- select --</option>
                    {policies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {isDraft && canManage && <button type="submit">Save</button>}
              </form>
            </CardContent>
          </Card>

          {isDraft && canManage && (
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-[0.92rem]">Audience</CardTitle>
                <CardDescription>Chọn danh sách contact nhận campaign này, hoặc gửi cho toàn bộ.</CardDescription>
              </CardHeader>
              <CardContent>
                <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
                  <input type="checkbox" checked={allContacts} onChange={(e) => setAllContacts(e.target.checked)} />
                  Gửi cho toàn bộ contact ({contacts.length})
                </label>
                {!allContacts && (
                  <div style={{ maxHeight: 180, overflowY: 'auto', margin: '0.5rem 0' }}>
                    {contacts.map((c) => (
                      <label key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
                        <input type="checkbox" checked={selectedContacts.includes(c.id)} onChange={() => toggleContact(c.id)} />
                        {c.displayName}
                      </label>
                    ))}
                  </div>
                )}
                <button type="button" onClick={triggerSend} style={{ marginTop: '0.6rem' }}>
                  Trigger send
                </button>
              </CardContent>
            </Card>
          )}

          {isDraft && canManage && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[0.92rem]">Gửi test trước khi publish</CardTitle>
                <CardDescription>
                  Gửi thử 1 tin dùng đúng template + failover policy của campaign này tới 1 số điện thoại — không
                  tính vào recipient/progress, chỉ để kiểm tra trước khi trigger send thật.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {testError && <p className="error">{testError}</p>}
                <form onSubmit={sendTest} style={{ maxWidth: '100%' }}>
                  <label>
                    Số điện thoại
                    <input type="tel" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="09xxxxxxxx" required />
                  </label>
                  <label>
                    Template variables (JSON)
                    <textarea rows={2} value={testVariables} onChange={(e) => setTestVariables(e.target.value)} />
                  </label>
                  <button type="submit" disabled={testSending}>
                    {testSending ? 'Đang gửi...' : 'Gửi test'}
                  </button>
                </form>

                {testRequest && (
                  <div style={{ marginTop: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="muted">Kết quả:</span>
                      <Badge status={testRequest.status} />
                      {!TERMINAL_STATUSES.has(testRequest.status) && <span className="muted">đang xử lý...</span>}
                    </div>
                    {testRequest.attempts.length > 0 && (
                      <table style={{ marginTop: '0.5rem' }}>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Channel strategy</th>
                            <th>Status</th>
                            <th>Error</th>
                            <th>Sent at</th>
                          </tr>
                        </thead>
                        <tbody>
                          {testRequest.attempts.map((a, i) => (
                            <tr key={a.id}>
                              <td>{i}</td>
                              <td className="muted">{a.channelStrategyId.slice(0, 8)}</td>
                              <td>
                                <Badge status={a.status} />
                              </td>
                              <td className="muted">{a.errorCode ? `${a.errorCode}: ${a.errorMessage ?? ''}` : ''}</td>
                              <td className="muted">{a.sentAt ? new Date(a.sentAt).toLocaleTimeString() : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------- Message ---------- */}
        <TabsContent value="message">
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <input placeholder="Search" value={messageSearch} onChange={(e) => setMessageSearch(e.target.value)} style={{ maxWidth: 260 }} />
          </div>
          <p className="muted">Found {filteredMessages.length} record(s)</p>
          <table>
            <thead>
              <tr>
                <th>User infor</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Created date</th>
                <th>Sent date</th>
                <th>Delivery date</th>
                <th>First click date</th>
                <th>Total click</th>
                <th>Open date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredMessages.map((r) => (
                <React.Fragment key={r.id}>
                  <tr>
                    <td>{r.contactName}</td>
                    <td className="muted">{r.channelName ?? '-'}</td>
                    <td>
                      <Badge status={r.status} />
                    </td>
                    <td className="muted">{formatDate(r.createdAt)}</td>
                    <td className="muted">{formatDate(r.firstSentAt)}</td>
                    <td className="muted">{r.status === 'delivered' ? formatDate(r.completedAt) : '-'}</td>
                    <td className="muted">{formatDate(r.firstClickedAt)}</td>
                    <td>{r.totalClicks}</td>
                    <td className="muted">{formatDate(r.firstOpenedAt)}</td>
                    <td>
                      <button className="secondary" onClick={() => toggleExpand(r.id)}>
                        {expandedId === r.id ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === r.id && detail[r.id] && (
                    <tr>
                      <td colSpan={10}>
                        <table>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Channel strategy</th>
                              <th>Status</th>
                              <th>Error</th>
                              <th>Sent at</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail[r.id].map((a, i) => (
                              <tr key={a.id}>
                                <td>{i}</td>
                                <td className="muted">{a.channelStrategyId.slice(0, 8)}</td>
                                <td>
                                  <Badge status={a.status} />
                                </td>
                                <td className="muted">{a.errorCode ? `${a.errorCode}: ${a.errorMessage ?? ''}` : ''}</td>
                                <td className="muted">{a.sentAt ? new Date(a.sentAt).toLocaleTimeString() : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {filteredMessages.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted" style={{ textAlign: 'center' }}>
                    Campaign chưa được trigger, hoặc chưa có recipient nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TabsContent>

        {/* ---------- Job ---------- */}
        <TabsContent value="job">
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <input placeholder="Search" value={jobSearch} onChange={(e) => setJobSearch(e.target.value)} style={{ maxWidth: 260 }} />
          </div>
          <p className="muted">Found {filteredJobs.length} record(s)</p>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>User infor</th>
                <th>Current step</th>
                <th>Current Status</th>
                <th>Created date</th>
                <th>Last updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{r.id.slice(0, 8)}</td>
                  <td>{r.contactName}</td>
                  <td>{r.currentStepOrder ?? '-'}</td>
                  <td>
                    <Badge status={r.status} />
                  </td>
                  <td className="muted">{formatDate(r.createdAt)}</td>
                  <td className="muted">{formatDate(r.lastUpdatedAt)}</td>
                </tr>
              ))}
              {filteredJobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: 'center' }}>
                    Campaign chưa được trigger, hoặc chưa có recipient nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
