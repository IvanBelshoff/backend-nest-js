export interface AiAnalysisJobPayload {
  userId: number;
  threadId: string;
  /** Pergunta analítica autocontida, reescrita pelo modelo para rodar sem histórico. */
  pergunta: string;
  /** Relatórios autorizados que a análise pode usar. */
  relatorioIds: number[];
  /** Contexto extra da conversa (período, métrica, recorte) que o modelo julgou relevante. */
  contexto?: string;
}
