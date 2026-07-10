export const REALTIME_EVENTS_CHANNEL = 'message-hub:events';

export interface MessageRequestUpdatedEvent {
  type: 'message-request-updated';
  messageRequestId: string;
  status: string;
  currentStepOrder: number | null;
}

export interface MessageAttemptUpdatedEvent {
  type: 'message-attempt-updated';
  messageRequestId: string;
  attemptId: string;
  status: string;
}

export type RealtimeEvent = MessageRequestUpdatedEvent | MessageAttemptUpdatedEvent;
