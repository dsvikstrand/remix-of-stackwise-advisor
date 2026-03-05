export type LaunchErrorCode =
  | 'INSUFFICIENT_CREDITS'
  | 'DAILY_GENERATION_CAP_REACHED'
  | 'TRANSCRIPT_UNAVAILABLE'
  | 'NO_TRANSCRIPT_PERMANENT'
  | 'RATE_LIMITED'
  | 'QUEUE_BACKPRESSURE'
  | 'QUEUE_INTAKE_DISABLED'
  | 'SOURCE_PAGE_NOT_FOUND'
  | string
  | null
  | undefined;

function normalizeCode(value: LaunchErrorCode) {
  return String(value || '').trim().toUpperCase();
}

export function getLaunchErrorCopy(input: {
  errorCode?: LaunchErrorCode;
  fallback: string;
}) {
  switch (normalizeCode(input.errorCode)) {
    case 'INSUFFICIENT_CREDITS':
      return 'Insufficient credits right now. Please wait for refill and try again.';
    case 'DAILY_GENERATION_CAP_REACHED':
      return 'Daily generation cap reached. Please try again after reset.';
    case 'TRANSCRIPT_UNAVAILABLE':
      return 'Transcript unavailable right now. Please try again in a few minutes.';
    case 'NO_TRANSCRIPT_PERMANENT':
      return 'No transcript is available for this video.';
    case 'RATE_LIMITED':
      return 'Too many requests right now. Please retry shortly.';
    case 'QUEUE_BACKPRESSURE':
      return 'Generation queue is busy. Please retry shortly.';
    case 'QUEUE_INTAKE_DISABLED':
      return 'Generation is temporarily paused. Please try again shortly.';
    case 'SOURCE_PAGE_NOT_FOUND':
      return 'Source page not found for this item.';
    default:
      return input.fallback;
  }
}
