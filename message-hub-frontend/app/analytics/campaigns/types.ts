// ---------- Types (mirrors GET /analytics/campaigns/summary and /analytics/campaigns) ----------

export type CampaignType = 'voucher' | 'loyalty' | 'reward' | 'other';
export type TypeFilter = 'all' | CampaignType;

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'completed';
export type StatusFilter = 'all' | CampaignStatus;

export interface Totals {
  campaigns: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
}

export interface ByType {
  campaignType: CampaignType;
  campaigns: number;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
}

export interface ByStatus {
  status: CampaignStatus | string;
  campaigns: number;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
}

export interface TrendPoint {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
}

export interface Summary {
  totals: Totals;
  byType: ByType[];
  byStatus: ByStatus[];
  trend: TrendPoint[];
}

export interface CampaignRow {
  id: string;
  name: string;
  campaignType: CampaignType;
  status: string;
  createdAt: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
}

export const TYPE_META: Record<CampaignType, { label: string; color: string; tint: string }> = {
  voucher: { label: 'Voucher', color: '#0aad64', tint: 'rgba(10, 173, 100, 0.16)' },
  loyalty: { label: 'Loyalty', color: '#2a5fd6', tint: 'rgba(42, 95, 214, 0.16)' },
  reward: { label: 'Reward', color: '#ff6900', tint: 'rgba(255, 105, 0, 0.16)' },
  other: { label: 'Khác', color: '#667085', tint: 'rgba(102, 112, 133, 0.16)' },
};

export const STATUS_META: Record<CampaignStatus, { label: string; color: string }> = {
  draft: { label: 'Nháp', color: '#667085' },
  scheduled: { label: 'Đã lên lịch', color: '#ffa700' },
  running: { label: 'Đang chạy', color: '#2a5fd6' },
  completed: { label: 'Hoàn tất', color: '#0aad64' },
};

export function effectiveType(t: CampaignType | string): CampaignType {
  return (t as CampaignType) in TYPE_META ? (t as CampaignType) : 'other';
}

export function typeMeta(t: CampaignType | string) {
  return TYPE_META[effectiveType(t)];
}

export function statusMeta(s: CampaignStatus | string) {
  return (
    STATUS_META[(s as CampaignStatus) in STATUS_META ? (s as CampaignStatus) : 'draft'] ?? {
      label: s,
      color: '#667085',
    }
  );
}

export function pct(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

export function compactNumber(n: number | undefined | null): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-US');
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}
