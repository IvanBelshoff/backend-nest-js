import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { env } from '../shared/env.schema';
import {
  RelatorioSnapshot,
  RelatorioSnapshotSchema,
} from '../report/schemas/relatorio-snapshot.schema';
import { AppLog, AppLogSchema } from '../report/schemas/app-log.schema';
import { AppLogService } from '../report/app-log.service';

@Global()
@Module({
  imports: [
    MongooseModule.forRoot(env.MONGO_URI, {
      dbName: env.MONGO_DB_NAME,
    }),
    MongooseModule.forFeature([
      { name: RelatorioSnapshot.name, schema: RelatorioSnapshotSchema },
      { name: AppLog.name, schema: AppLogSchema },
    ]),
  ],
  providers: [AppLogService],
  exports: [MongooseModule, AppLogService],
})
export class MongodbModule {}
