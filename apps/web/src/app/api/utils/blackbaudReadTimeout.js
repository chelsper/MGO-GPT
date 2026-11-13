export const BLACKBAUD_READ_TIMEOUT = "BLACKBAUD_READ_TIMEOUT";

export function isBlackbaudReadTimeout(error) {
  return error?.code === BLACKBAUD_READ_TIMEOUT && error?.readRetryable === true;
}

export function readTimeoutMetadata(error) {
  return isBlackbaudReadTimeout(error)
    ? { code: BLACKBAUD_READ_TIMEOUT, readRetryable: true }
    : {};
}
