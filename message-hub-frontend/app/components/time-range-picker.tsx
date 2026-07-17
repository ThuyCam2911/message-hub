'use client';

import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Button } from '../../components/ui/button';
import { Calendar } from '../../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { cn } from '../../lib/utils';

export type RangePreset = '7d' | '30d' | '90d' | 'all' | 'custom';

export interface TimeRange {
  preset: RangePreset;
  from: Date | null;
  to: Date | null;
}

const PRESETS: { key: RangePreset; label: string; days: number | null }[] = [
  { key: '7d', label: '7 ngày', days: 7 },
  { key: '30d', label: '30 ngày', days: 30 },
  { key: '90d', label: '90 ngày', days: 90 },
  { key: 'all', label: 'Tất cả', days: null },
];

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

export function presetToRange(preset: RangePreset): { from: Date | null; to: Date | null } {
  if (preset === 'all') return { from: null, to: null };
  const days = PRESETS.find((p) => p.key === preset)?.days;
  if (!days) return { from: null, to: null };
  const to = endOfDay(new Date());
  const from = startOfDay(new Date());
  from.setDate(from.getDate() - (days - 1));
  return { from, to };
}

function formatShort(d: Date): string {
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function rangeLabel(range: TimeRange): string {
  if (range.preset !== 'custom') {
    return PRESETS.find((p) => p.key === range.preset)?.label ?? 'Tất cả';
  }
  if (range.from && range.to) return `${formatShort(range.from)} – ${formatShort(range.to)}`;
  if (range.from) return `Từ ${formatShort(range.from)}`;
  return 'Chọn khoảng ngày';
}

export function TimeRangePicker({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(
    value.from && value.to ? { from: value.from, to: value.to } : undefined
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((p) => (
        <Button
          key={p.key}
          type="button"
          size="sm"
          variant={value.preset === p.key ? 'default' : 'outline'}
          className="h-8 rounded-full px-3 text-xs font-semibold"
          onClick={() => onChange({ preset: p.key, ...presetToRange(p.key) })}
        >
          {p.label}
        </Button>
      ))}

      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) {
            setDraft(value.from && value.to ? { from: value.from, to: value.to } : undefined);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={value.preset === 'custom' ? 'default' : 'outline'}
            className={cn('h-8 gap-1.5 rounded-full px-3 text-xs font-semibold')}
          >
            <CalendarIcon className="size-3.5" />
            {value.preset === 'custom' ? rangeLabel(value) : 'Tuỳ chọn...'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            defaultMonth={draft?.from}
            selected={draft}
            onSelect={setDraft}
            numberOfMonths={2}
          />
          <div className="flex items-center justify-between gap-2 border-t p-2.5">
            <span className="px-1 text-xs text-muted-foreground">
              {draft?.from && draft?.to
                ? `${formatShort(draft.from)} – ${formatShort(draft.to)}`
                : 'Chọn ngày bắt đầu & kết thúc'}
            </span>
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-xs"
              disabled={!draft?.from || !draft?.to}
              onClick={() => {
                if (!draft?.from || !draft?.to) return;
                onChange({ preset: 'custom', from: startOfDay(draft.from), to: endOfDay(draft.to) });
                setOpen(false);
              }}
            >
              Áp dụng
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
