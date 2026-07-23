import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  UserAuditLog,
  UserAuditLogSchema,
} from './schemas/user-audit-log.schema';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserAuditLog.name, schema: UserAuditLogSchema },
    ]),
  ],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
