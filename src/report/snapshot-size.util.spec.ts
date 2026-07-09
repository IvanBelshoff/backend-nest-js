import {
  buildSnapshotSizeExceededMessage,
  estimateSnapshotPayloadBytes,
  SAFE_SNAPSHOT_MAX_BYTES,
} from './snapshot-size.util';

describe('snapshot-size.util', () => {
  it('detects payloads above MongoDB safe limit', () => {
    const payload = {
      relatorio_id: 1,
      dados: Array.from({ length: 1000 }, () => ({
        campo: 'x'.repeat(20_000),
      })),
    };

    const bytes = estimateSnapshotPayloadBytes(payload);
    expect(bytes).toBeGreaterThan(SAFE_SNAPSHOT_MAX_BYTES);
    expect(buildSnapshotSizeExceededMessage(bytes)).toContain('limite do MongoDB');
  });

  it('accepts small payloads', () => {
    const bytes = estimateSnapshotPayloadBytes({
      relatorio_id: 1,
      dados: [{ id: 1 }],
    });

    expect(bytes).toBeLessThan(SAFE_SNAPSHOT_MAX_BYTES);
  });
});
