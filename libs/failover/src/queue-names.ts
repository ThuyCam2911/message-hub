export const QUEUE_DISPATCH = 'dispatch';
export const QUEUE_ATTEMPT = 'attempt';
export const QUEUE_TIMEOUT_CHECK = 'timeout-check';

export interface DispatchJobData {
  messageRequestId: string;
}

export interface AttemptJobData {
  messageRequestId: string;
  stepOrder: number;
}

export interface TimeoutCheckJobData {
  messageAttemptId: string;
}
