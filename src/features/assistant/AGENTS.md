# Assistant rules

- Assistant IA lives in `src/features/assistant/`, its deterministic engine in `src/mocks/assistant.ts` and its adapter in `src/lib/api/assistant.ts` (re-exported by client.ts); every claim carries an evidence kind (OBSERVED/CALCULATED/INTERPRETED/UNAVAILABLE) and numbers are computed from mock points or the dictionary adapter, so unsupported questions answer UNAVAILABLE instead of inventing data.
