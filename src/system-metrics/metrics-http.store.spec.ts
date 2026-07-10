import { MetricsHttpStore } from './metrics-http.store';



describe('MetricsHttpStore', () => {

  it('aggregates latency percentiles and resets the window', () => {

    const store = new MetricsHttpStore();



    store.record(100, false);

    store.record(200, false);

    store.record(300, true);

    store.record(400, false);



    const snapshot = store.snapshotAndReset();



    expect(snapshot.requestsInWindow).toBe(4);

    expect(snapshot.errorRatePercent).toBe(25);

    expect(snapshot.latencyMs.p50).toBe(200);

    expect(snapshot.latencyMs.p95).toBe(400);

    expect(snapshot.latencyMs.p99).toBe(400);



    const emptySnapshot = store.snapshotAndReset();

    expect(emptySnapshot.requestsInWindow).toBe(0);

    expect(emptySnapshot.errorRatePercent).toBe(0);

    expect(emptySnapshot.latencyMs.p50).toBe(0);

  });



  it('peeks at the current window without resetting it', () => {

    const store = new MetricsHttpStore();



    store.record(100, false);

    store.record(200, true);



    const peeked = store.peek();



    expect(peeked.requestsInWindow).toBe(2);

    expect(peeked.errorRatePercent).toBe(50);

    expect(peeked.latencyMs.p95).toBe(200);



    const peekedAgain = store.peek();

    expect(peekedAgain.requestsInWindow).toBe(2);



    const snapshot = store.snapshotAndReset();

    expect(snapshot.requestsInWindow).toBe(2);

    expect(store.peek().requestsInWindow).toBe(0);

  });

});


