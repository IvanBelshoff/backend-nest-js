import { buildCsvContent } from './csv-writer.util';

describe('csv-writer.util', () => {
  it('escapes values with commas and quotes', () => {
    const csv = buildCsvContent(['nome', 'valor'], [
      { nome: 'Item, A', valor: '10" cm' },
    ]);

    expect(csv).toContain('"Item, A"');
    expect(csv).toContain('"10"" cm"');
  });

  it('includes utf-8 bom', () => {
    const csv = buildCsvContent(['id'], [{ id: 1 }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });
});
