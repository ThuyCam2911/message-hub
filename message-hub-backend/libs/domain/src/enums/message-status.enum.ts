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

/**
 * Only meaningful for channels where the provider must approve template
 * content before it can be sent (WhatsApp Business, Zalo ZNS). Channels with
 * no approval concept (SMS/Telegram/Line/email/Zalo OA freeform) go straight
 * to NOT_REQUIRED.
 */
export enum TemplateApprovalStatus {
  NOT_REQUIRED = 'not_required',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
