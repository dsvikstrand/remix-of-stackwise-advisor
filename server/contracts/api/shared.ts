export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { flatten: () => unknown } };

export type SafeParser<T> = {
  safeParse: (input: unknown) => ParseResult<T>;
};

export type ApiErrorEnvelope<TData = null> = {
  ok: false;
  error_code: string;
  message: string;
  data: TData;
};

export type ApiSuccessEnvelope<TData> = {
  ok: true;
  error_code: null;
  message: string;
  data: TData;
};
