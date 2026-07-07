import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppLog } from './schemas/app-log.schema';

export interface AppLogInput {
  nivel: string;
  mensagem: string;
  contexto?: Record<string, unknown>;
  usuario_id?: number | null;
}

@Injectable()
export class AppLogService {
  constructor(
    @InjectModel(AppLog.name)
    private readonly appLogModel: Model<AppLog>,
  ) {}

  async log(input: AppLogInput): Promise<void> {
    await this.appLogModel.create({
      nivel: input.nivel,
      mensagem: input.mensagem,
      contexto: input.contexto ?? {},
      usuario_id: input.usuario_id ?? null,
    });
  }
}
