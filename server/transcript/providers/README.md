# Transcript Provider Integration Guide

This folder contains transcript provider implementations used by the YouTube pipeline.

## Required Adapter Interface

Each provider should export an adapter matching `TranscriptProviderAdapter` from `server/transcript/types.ts`:

```ts
type TranscriptProviderAdapter = {
  id: TranscriptProvider;
  getTranscript: (videoId: string) => Promise<TranscriptResult>;
};
```

## Required Error Mapping Rules

Provider implementations must throw `TranscriptProviderError` with one of:

- `NO_CAPTIONS`
- `TRANSCRIPT_FETCH_FAIL`
- `TRANSCRIPT_EMPTY`
- `TIMEOUT`

Unknown errors are normalized by orchestration to `TRANSCRIPT_FETCH_FAIL`.

## Registration Steps

1. Implement provider module under `server/transcript/providers/`.
2. Export both:
   - provider function (`getTranscriptFromX`)
   - adapter object (`xTranscriptProviderAdapter`)
3. Register adapter in `server/transcript/providerRegistry.ts` default provider list.
4. Ensure provider id is part of `TranscriptProvider` union in `server/transcript/types.ts`.
5. (Optional) Add provider id handling in `resolveTranscriptProvider()` if it should be selectable via `TRANSCRIPT_PROVIDER`.

## Minimal Safe Checklist For Third Provider

- Returns `TranscriptResult` with normalized text.
- Throws only supported error codes for expected failure classes.
- Handles provider-specific parse failures as `TRANSCRIPT_FETCH_FAIL`.
- Keeps transcript semantics consistent with existing providers.
- Validated by:
  - provider resolution test
  - probe matrix parity test
  - unknown error normalization test

