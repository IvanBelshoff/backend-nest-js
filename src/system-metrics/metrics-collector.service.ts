import { Injectable } from '@nestjs/common';

import { InjectConnection } from '@nestjs/mongoose';

import { InjectDataSource } from '@nestjs/typeorm';

import { readdir, stat } from 'node:fs/promises';

import { existsSync, readFileSync as readFileSyncSync } from 'node:fs';

import { resolve } from 'node:path';

import { performance } from 'node:perf_hooks';

import { loadavg } from 'node:os';

import { Connection } from 'mongoose';

import { DataSource } from 'typeorm';

import { PgBossService } from 'src/queue/pg-boss.service';

import {

  REPORT_EXPORT_QUEUE,

  REPORT_SNAPSHOT_QUEUE,

} from 'src/queue/queue.constants';

import { env } from 'src/shared/env.schema';

import { MetricsHttpStore } from './metrics-http.store';

import type {

  SystemMetricsLiveSnapshot,

  SystemMetricsProcess,

  SystemMetricsSnapshot,

} from './types/system-metrics.types';



const packageVersion = JSON.parse(

  readFileSyncSync(resolve(process.cwd(), 'package.json'), 'utf8'),

).version as string;



type CpuSample = {

  usage: NodeJS.CpuUsage;

  at: number;

};



@Injectable()

export class MetricsCollectorService {

  private lastCpuSample: CpuSample | null = null;



  constructor(

    @InjectDataSource()

    private readonly dataSource: DataSource,

    @InjectConnection()

    private readonly mongoConnection: Connection,

    private readonly pgBossService: PgBossService,

    private readonly metricsHttpStore: MetricsHttpStore,

  ) {}



  async collectLiveSnapshot(): Promise<SystemMetricsLiveSnapshot> {

    return {

      recordedAt: new Date().toISOString(),

      process: await this.collectProcessMetrics(),

      http: this.metricsHttpStore.peek(),

    };

  }



  async collectSnapshot(): Promise<SystemMetricsSnapshot> {

    const [postgresql, mongodb, pgBoss, storage, http] = await Promise.all([

      this.collectPostgresqlMetrics(),

      this.collectMongodbMetrics(),

      this.collectPgBossMetrics(),

      this.collectStorageMetrics(),

      Promise.resolve(this.metricsHttpStore.snapshotAndReset()),

    ]);



    return {

      recordedAt: new Date().toISOString(),

      version: packageVersion,

      environment: env.NODE_ENV,

      process: await this.collectProcessMetrics(),

      dependencies: {

        postgresql,

        mongodb,

        pgBoss,

      },

      http,

      storage,

    };

  }



  private async collectProcessMetrics(): Promise<SystemMetricsProcess> {

    const memory = process.memoryUsage();



    return {

      uptimeSeconds: Math.floor(process.uptime()),

      memoryMb: {

        heapUsed: bytesToMb(memory.heapUsed),

        rss: bytesToMb(memory.rss),

        external: bytesToMb(memory.external),

      },

      loadAvg: loadavg() as [number, number, number],

      eventLoopLagMs: await measureEventLoopLag(),

      cpuPercent: this.sampleCpuPercent(),

    };

  }



  private sampleCpuPercent(): number | null {

    const now = Date.now();

    const currentUsage = process.cpuUsage();



    if (!this.lastCpuSample) {

      this.lastCpuSample = { usage: currentUsage, at: now };

      return null;

    }



    const elapsedMs = now - this.lastCpuSample.at;

    if (elapsedMs <= 0) {

      return null;

    }



    const diff = process.cpuUsage(this.lastCpuSample.usage);

    this.lastCpuSample = { usage: currentUsage, at: now };



    const cpuPercent = Number(

      (((diff.user + diff.system) / 1000 / elapsedMs) * 100).toFixed(2),

    );



    return Number.isFinite(cpuPercent) ? cpuPercent : null;

  }



  private async collectPostgresqlMetrics(): Promise<

    SystemMetricsSnapshot['dependencies']['postgresql']

  > {

    const startedAt = performance.now();



    try {

      await this.dataSource.query('SELECT 1');

      return {

        status: 'up',

        latencyMs: Math.round(performance.now() - startedAt),

      };

    } catch {

      return {

        status: 'down',

        latencyMs: Math.round(performance.now() - startedAt),

      };

    }

  }



  private async collectMongodbMetrics(): Promise<

    SystemMetricsSnapshot['dependencies']['mongodb']

  > {

    const startedAt = performance.now();



    try {

      if (this.mongoConnection.readyState !== 1 || !this.mongoConnection.db) {

        throw new Error('MongoDB not connected');

      }



      await this.mongoConnection.db.admin().command({ ping: 1 });



      return {

        status: 'up',

        latencyMs: Math.round(performance.now() - startedAt),

      };

    } catch {

      return {

        status: 'down',

        latencyMs: Math.round(performance.now() - startedAt),

      };

    }

  }



  private async collectPgBossMetrics(): Promise<

    SystemMetricsSnapshot['dependencies']['pgBoss']

  > {

    if (!this.pgBossService.isEnabled) {

      return { status: 'disabled', queues: [] };

    }



    try {

      const queues = await this.pgBossService.getQueueMetrics([

        REPORT_SNAPSHOT_QUEUE,

        REPORT_EXPORT_QUEUE,

      ]);



      return { status: 'up', queues };

    } catch {

      return { status: 'down', queues: [] };

    }

  }



  private async collectStorageMetrics(): Promise<SystemMetricsSnapshot['storage']> {

    const baseDir = resolve(env.SNAPSHOT_STORAGE_DIR);



    if (!existsSync(baseDir)) {

      return { snapshotsDiskMb: 0, snapshotsFileCount: 0 };

    }



    const entries = await readdir(baseDir, { recursive: true, withFileTypes: true });

    let totalBytes = 0;

    let fileCount = 0;



    for (const entry of entries) {

      if (!entry.isFile()) {

        continue;

      }



      const parentPath =

        (entry as unknown as { parentPath?: string }).parentPath ?? baseDir;

      const filePath = resolve(parentPath, entry.name);

      const fileStat = await stat(filePath);

      totalBytes += fileStat.size;

      fileCount += 1;

    }



    return {

      snapshotsDiskMb: Number((totalBytes / (1024 * 1024)).toFixed(2)),

      snapshotsFileCount: fileCount,

    };

  }

}



function bytesToMb(value: number): number {

  return Number((value / (1024 * 1024)).toFixed(2));

}



function measureEventLoopLag(): Promise<number> {

  return new Promise((resolveLag) => {

    const startedAt = performance.now();

    setImmediate(() => {

      resolveLag(Math.round(performance.now() - startedAt));

    });

  });

}


