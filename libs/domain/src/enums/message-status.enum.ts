export enum MessageRequestStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum MessageAttemptStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  DELIVERED = 'delivered',
  UNDELIVERED = 'undelivered',
  PROVIDER_ERROR = 'provider_error',
  TIMED_OUT = 'timed_out',
  SUPERSEDED = 'superseded',
}

export enum AdvanceOn {
  PROVIDER_ERROR = 'provider_error',
  NO_CONFIRMATION_TIMEOUT = 'no_confirmation_timeout',
  EITHER = 'either',
}
