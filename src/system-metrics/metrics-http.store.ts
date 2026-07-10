import { Injectable } from '@nestjs/common';



type HttpWindowSnapshot = {

  requestsInWindow: number;

  errorRatePercent: number;

  latencyMs: {

    p50: number;

    p95: number;

    p99: number;

  };

};



@Injectable()

export class MetricsHttpStore {

  private durationsMs: number[] = [];

  private errorCount = 0;



  record(durationMs: number, isError: boolean): void {

    this.durationsMs.push(durationMs);

    if (isError) {

      this.errorCount += 1;

    }

  }



  peek(): HttpWindowSnapshot {

    return this.buildSnapshot();

  }



  snapshotAndReset(): HttpWindowSnapshot {

    const result = this.buildSnapshot();

    this.durationsMs = [];

    this.errorCount = 0;

    return result;

  }



  private buildSnapshot(): HttpWindowSnapshot {

    const requestsInWindow = this.durationsMs.length;

    const sorted = [...this.durationsMs].sort((a, b) => a - b);

    const errorRatePercent =

      requestsInWindow === 0

        ? 0

        : Number(((this.errorCount / requestsInWindow) * 100).toFixed(2));



    return {

      requestsInWindow,

      errorRatePercent,

      latencyMs: {

        p50: percentile(sorted, 50),

        p95: percentile(sorted, 95),

        p99: percentile(sorted, 99),

      },

    };

  }

}



function percentile(sortedValues: number[], percentileValue: number): number {

  if (sortedValues.length === 0) {

    return 0;

  }



  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;

  const safeIndex = Math.min(Math.max(index, 0), sortedValues.length - 1);

  return Math.round(sortedValues[safeIndex]);

}


