// Real, sendable channel types offered when creating a channel or template.
// 'mock' is intentionally excluded — it's a fake test-only provider (see
// channels/page.tsx's CHANNEL_ICONS comment), so it isn't offered here even
// though existing mock data can still be viewed/managed elsewhere.
export const CHANNEL_TYPES = ['zbs', 'sms', 'telegram', 'line', 'whatsapp', 'email'];
