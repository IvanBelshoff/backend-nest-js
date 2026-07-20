import { Privacidade } from 'src/database/entities/privacidade.enum';
import {
  isPublicVisibleReport,
  resolvePermitirConhecimentoIa,
} from './report-ai-knowledge.util';

describe('report-ai-knowledge.util', () => {
  describe('isPublicVisibleReport', () => {
    it('returns true for public visible reports', () => {
      expect(
        isPublicVisibleReport({
          privacidade: Privacidade.PUBLIC,
          visivel: true,
        }),
      ).toBe(true);
    });

    it('returns false for hidden public reports', () => {
      expect(
        isPublicVisibleReport({
          privacidade: Privacidade.PUBLIC,
          visivel: false,
        }),
      ).toBe(false);
    });
  });

  describe('resolvePermitirConhecimentoIa', () => {
    it('returns true for public visible reports without grant', () => {
      const result = resolvePermitirConhecimentoIa(
        {
          privacidade: Privacidade.PUBLIC,
          visivel: true,
          usuarioRelatorios: [],
        },
        1,
      );

      expect(result).toBe(true);
    });

    it('returns false when user has no grant on private report', () => {
      const result = resolvePermitirConhecimentoIa(
        {
          privacidade: Privacidade.PRIVAT,
          visivel: true,
          usuarioRelatorios: [
            {
              usuarioId: 2,
              permitirConhecimentoIa: true,
            } as never,
          ],
        },
        1,
      );

      expect(result).toBe(false);
    });

    it('returns false when private grant has IA disabled', () => {
      const result = resolvePermitirConhecimentoIa(
        {
          privacidade: Privacidade.PRIVAT,
          visivel: true,
          usuarioRelatorios: [
            {
              usuarioId: 1,
              permitirConhecimentoIa: false,
            } as never,
          ],
        },
        1,
      );

      expect(result).toBe(false);
    });

    it('returns true when private grant has IA enabled', () => {
      const result = resolvePermitirConhecimentoIa(
        {
          privacidade: Privacidade.PRIVAT,
          visivel: true,
          usuarioRelatorios: [
            {
              usuarioId: 1,
              permitirConhecimentoIa: true,
            } as never,
          ],
        },
        1,
      );

      expect(result).toBe(true);
    });
  });
});
