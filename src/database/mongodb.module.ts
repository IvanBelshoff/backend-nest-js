import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { env } from '../shared/env.schema';
import {
  RelatorioSnapshot,
  RelatorioSnapshotSchema,
} from '../report/schemas/relatorio-snapshot.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forRoot(env.MONGO_URI, {
      dbName: env.MONGO_DB_NAME,
    }),
    MongooseModule.forFeature([
      { name: RelatorioSnapshot.name, schema: RelatorioSnapshotSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class MongodbModule {}
