'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api-client';
import { hasRole } from '../lib/auth';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { TimeRangePicker, type TimeRange } from '../components/time-range-picker';

interface Template {
  id: string;
  name: string;
}
interface Policy {
  id: string;
  name: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  campaignType: string;
  templateId: string;
  failoverPolicyId: string;
  startDate: string | null;
  endDate: string | null;
  progress: { total: number; delivered: number; failed: number; inProgress: number; openRate: number; clickRate: number };
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'draft', label: 'Draft' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Complete' },
];

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function formatDate(d: string | null): string {
  if (!d) return '-';
  return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CampaignsPage() {
  const canManage = hasRole('admin', 'operator');

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState<TimeRange>({ preset: 'all', from: null, to: null });

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [failoverPolicyId, setFailoverPolicyId] = useState('');
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);

  async function loadOptions() {
    try {
      const [t, p] = await Promise.all([api.get<Template[]>('/templates'), api.get<Policy[]>('/failover-policies')]);
      setTemplates(t);
      setPolicies(p);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function search() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchInput.trim()) params.set('search', searchInput.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (dateRange.from) params.set('from', dateRange.from.toISOString());
      if (dateRange.to) params.set('to', dateRange.to.toISOString());
      const qs = params.toString();
      const result = await api.get<Campaign[]>(`/campaigns${qs ? `?${qs}` : ''}`);
      setCampaigns(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadAllForCounts() {
    try {
      setAllCampaigns(await api.get<Campaign[]>('/campaigns'));
    } catch {
      // status counts are a nice-to-have; the main search() call above surfaces real errors
    }
  }

  useEffect(() => {
    loadOptions();
    loadAllForCounts();
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setEditingCampaignId(null);
    setName('');
    setTemplateId('');
    setFailoverPolicyId('');
    setShowCreateForm(false);
  }

  function startEdit(c: Campaign) {
    setEditingCampaignId(c.id);
    setName(c.name);
    setTemplateId(c.templateId);
    setFailoverPolicyId(c.failoverPolicyId);
    setShowCreateForm(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submitCampaign(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editingCampaignId) {
        await api.patch(`/campaigns/${editingCampaignId}`, { name, templateId, failoverPolicyId });
      } else {
        await api.post('/campaigns', { name, templateId, failoverPolicyId });
      }
      resetForm();
      await Promise.all([search(), loadAllForCounts()]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteCampaign(c: Campaign) {
    if (!confirm(`Xoá campaign "${c.name}"?`)) return;
    setError(null);
    try {
      await api.delete(`/campaigns/${c.id}`);
      if (editingCampaignId === c.id) resetForm();
      await Promise.all([search(), loadAllForCounts()]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const statusCounts = {
    draft: allCampaigns.filter((c) => c.status === 'draft').length,
    running: allCampaigns.filter((c) => c.status === 'running').length,
    completed: allCampaigns.filter((c) => c.status === 'completed').length,
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Campaigns</h1>
          <p className="muted" style={{ margin: 0 }}>
            Gửi hàng loạt: chọn template + failover policy, chọn danh sách contact (hoặc toàn bộ) ở trang chi tiết
            campaign, rồi trigger.
          </p>
        </div>
        {canManage && (
          <Button type="button" onClick={() => setShowCreateForm((v) => !v)}>
            {showCreateForm ? 'Đóng' : '+ Create New Campaign'}
          </Button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {canManage && showCreateForm && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <h2 style={{ marginTop: 0 }}>{editingCampaignId ? 'Edit campaign' : 'Create a campaign'}</h2>
            <form onSubmit={submitCampaign}>
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label>
                Template
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
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
                <select value={failoverPolicyId} onChange={(e) => setFailoverPolicyId(e.target.value)} required>
                  <option value="">-- select --</option>
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit">{editingCampaignId ? 'Update campaign' : 'Create campaign'}</button>
                <button type="button" className="secondary" onClick={resetForm}>
                  Cancel
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <input
          style={{ maxWidth: 260 }}
          placeholder="Enter campaign name or ID"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[168px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <TimeRangePicker value={dateRange} onChange={setDateRange} />
        <Button type="button" onClick={search}>
          Search
        </Button>

        <div className="ml-auto flex gap-2.5">
          <Card>
            <CardContent className="px-4 py-2.5">
              <div className="text-xs font-semibold text-muted-foreground">Draft</div>
              <div className="text-lg font-bold">{statusCounts.draft}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-4 py-2.5">
              <div className="text-xs font-semibold text-muted-foreground">Running</div>
              <div className="text-lg font-bold">{statusCounts.running}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-4 py-2.5">
              <div className="text-xs font-semibold text-muted-foreground">Complete</div>
              <div className="text-lg font-bold text-[hsl(var(--chart-1))]">{statusCounts.completed}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="muted">
        {loading ? 'Đang tải...' : `Found ${campaigns.length} record(s)`}
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Campaign Name</TableHead>
                <TableHead>Start date</TableHead>
                <TableHead>End date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Targeted</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>Open rate</TableHead>
                <TableHead>Click rate</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="muted">#{c.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Link href={`/campaigns/${c.id}`} style={{ textDecoration: 'none', color: 'var(--text)' }}>
                      <strong>{c.name}</strong>
                    </Link>
                    <div style={{ marginTop: '0.25rem' }}>
                      <span className={`badge badge-type-${c.campaignType}`}>{c.campaignType}</span>
                    </div>
                  </TableCell>
                  <TableCell className="muted">{formatDate(c.startDate)}</TableCell>
                  <TableCell className="muted">{formatDate(c.endDate)}</TableCell>
                  <TableCell>
                    <span className={`badge badge-${c.status === 'running' ? 'in_progress' : c.status}`}>{c.status}</span>
                  </TableCell>
                  <TableCell>{c.progress.total}</TableCell>
                  <TableCell>{c.progress.delivered}</TableCell>
                  <TableCell>{pct(c.progress.openRate)}</TableCell>
                  <TableCell>{pct(c.progress.clickRate)}</TableCell>
                  <TableCell>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <Link href={`/campaigns/${c.id}`}>
                        <button type="button" className="secondary">
                          Xem chi tiết
                        </button>
                      </Link>
                      {canManage && c.status === 'draft' && (
                        <>
                          <button type="button" className="secondary" onClick={() => startEdit(c)}>
                            Edit
                          </button>
                          <button type="button" className="secondary" onClick={() => deleteCampaign(c)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {campaigns.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={10} className="muted text-center">
                    Không có campaign nào khớp bộ lọc.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
