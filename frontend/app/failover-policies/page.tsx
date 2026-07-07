'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../lib/api-client';

interface ChannelView {
  id: string;
  name: string;
  channelType: string;
  strategies: { id: string; strategyKey: string }[];
}

interface StepDraft {
  id: string;
  channelStrategyId: string;
  timeoutSeconds?: number;
  advanceOn: 'provider_error' | 'no_confirmation_timeout' | 'either';
}

interface Policy {
  id: string;
  name: string;
  steps: { stepOrder: number; channelStrategyId: string; timeoutSeconds?: number; advanceOn: string }[];
}

function newStepDraft(): StepDraft {
  return { id: crypto.randomUUID(), channelStrategyId: '', advanceOn: 'either' };
}

function SortableStepRow({
  step,
  index,
  total,
  strategyOptions,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  removable,
}: {
  step: StepDraft;
  index: number;
  total: number;
  strategyOptions: { id: string; label: string }[];
  onChange: (patch: Partial<StepDraft>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  removable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} className="card" style={{ ...style, padding: '0.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
        <span
          {...attributes}
          {...listeners}
          style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: '1.1rem', userSelect: 'none' }}
          title="Kéo để đổi thứ tự"
        >
          ⠿
        </span>
        <strong>Step {index}</strong>
        <button
          type="button"
          className="secondary"
          disabled={index === 0}
          onClick={onMoveUp}
          aria-label={`Move step ${index} up`}
          style={{ padding: '0.1rem 0.5rem' }}
        >
          ▲
        </button>
        <button
          type="button"
          className="secondary"
          disabled={index === total - 1}
          onClick={onMoveDown}
          aria-label={`Move step ${index} down`}
          style={{ padding: '0.1rem 0.5rem' }}
        >
          ▼
        </button>
      </div>
      <label>
        Channel strategy
        <select value={step.channelStrategyId} onChange={(e) => onChange({ channelStrategyId: e.target.value })}>
          <option value="">-- select --</option>
          {strategyOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Timeout seconds (optional, blank = adapter default)
        <input
          type="number"
          value={step.timeoutSeconds ?? ''}
          onChange={(e) => onChange({ timeoutSeconds: e.target.value ? Number(e.target.value) : undefined })}
        />
      </label>
      <label>
        Advance on
        <select value={step.advanceOn} onChange={(e) => onChange({ advanceOn: e.target.value as StepDraft['advanceOn'] })}>
          <option value="either">either (sync error or async failure/timeout)</option>
          <option value="provider_error">provider_error (no delivery confirmation expected)</option>
          <option value="no_confirmation_timeout">no_confirmation_timeout (must wait for confirmation)</option>
        </select>
      </label>
      {removable && (
        <button type="button" className="secondary" onClick={onRemove}>
          Remove step
        </button>
      )}
    </div>
  );
}

export default function FailoverPoliciesPage() {
  const [channels, setChannels] = useState<ChannelView[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([newStepDraft()]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const strategyOptions = channels.flatMap((c) =>
    c.strategies.map((s) => ({ id: s.id, label: `${c.name} (${c.channelType}) / ${s.strategyKey}` })),
  );

  async function load() {
    try {
      const [c, p] = await Promise.all([api.get<ChannelView[]>('/channels'), api.get<Policy[]>('/failover-policies')]);
      setChannels(c);
      setPolicies(p);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStepRow() {
    setSteps([...steps, newStepDraft()]);
  }

  function removeStepRow(index: number) {
    setSteps(steps.filter((_, i) => i !== index));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = steps.findIndex((s) => s.id === active.id);
    const newIndex = steps.findIndex((s) => s.id === over.id);
    setSteps(arrayMove(steps, oldIndex, newIndex));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps(arrayMove(steps, index, target));
  }

  async function createPolicy(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/failover-policies', {
        name,
        steps: steps.map((s, index) => ({
          stepOrder: index,
          channelStrategyId: s.channelStrategyId,
          timeoutSeconds: s.timeoutSeconds,
          advanceOn: s.advanceOn,
        })),
      });
      setName('');
      setSteps([newStepDraft()]);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <h1>Failover Policies</h1>
      {error && <p className="error">{error}</p>}
      <p className="muted">
        Ví dụ: đặt tên "ZBS UID → ZBS phone → SMS" và thêm 3 bước, kéo-thả (⠿) để sắp xếp thứ tự thực thi. Bước cuối
        nên đặt advance_on = provider_error nếu kênh đó không có delivery webhook (vd SMS/email cơ bản).
      </p>

      <h2>Create a policy</h2>
      <form onSubmit={createPolicy}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {steps.map((step, index) => (
              <SortableStepRow
                key={step.id}
                step={step}
                index={index}
                total={steps.length}
                strategyOptions={strategyOptions}
                onChange={(patch) => updateStep(index, patch)}
                onRemove={() => removeStepRow(index)}
                onMoveUp={() => moveStep(index, -1)}
                onMoveDown={() => moveStep(index, 1)}
                removable={steps.length > 1}
              />
            ))}
          </SortableContext>
        </DndContext>

        <button type="button" className="secondary" onClick={addStepRow}>
          + Add step
        </button>
        <button type="submit">Create policy</button>
      </form>

      <h2>Existing policies</h2>
      {policies.map((p) => (
        <div className="card" key={p.id}>
          <strong>{p.name}</strong>
          <ol>
            {p.steps.map((s) => (
              <li key={s.stepOrder}>
                {strategyOptions.find((o) => o.id === s.channelStrategyId)?.label ?? s.channelStrategyId} —{' '}
                advance_on={s.advanceOn}
                {s.timeoutSeconds ? `, timeout=${s.timeoutSeconds}s` : ''}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
