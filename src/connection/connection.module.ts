import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/audit/audit.module';
import { Conexao } from 'src/database/entities/Conexoes';
import { ConnectionController } from './connection.controller';
import { ConnectionQueryService } from './connection-query.service';
import { ConnectionService } from './connection.service';
import { SchemaIntrospectionService } from './schema/schema-introspection.service';

@Module({
  imports: [TypeOrmModule.forFeature([Conexao]), AuditModule],
  controllers: [ConnectionController],
  providers: [ConnectionService, ConnectionQueryService, SchemaIntrospectionService],
  exports: [ConnectionService],
})
export class ConnectionModule {}
