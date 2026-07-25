import { TipoConexao } from 'src/database/entities/Conexoes';
import {
  mapColumnList,
  mapNullable,
  mapSchemaList,
  mapTableList,
  mapTableTipo,
} from './schema-introspection.strategies';

describe('schema-introspection.strategies', () => {
  it('maps schema list for postgres', () => {
    const result = mapSchemaList([{ nome: 'public' }], TipoConexao.POSTGRES);
    expect(result.items).toEqual([{ nome: 'public', tipo: 'schema' }]);
  });

  it('maps schema list for mysql as database', () => {
    const result = mapSchemaList([{ nome: 'datadash' }], TipoConexao.MYSQL);
    expect(result.items).toEqual([{ nome: 'datadash', tipo: 'database' }]);
  });

  it('maps table and column metadata', () => {
    expect(mapTableTipo('VIEW')).toBe('view');
    expect(mapTableTipo('BASE TABLE')).toBe('table');
    expect(mapNullable('YES')).toBe(true);
    expect(mapNullable('NO')).toBe(false);

    expect(
      mapTableList([{ nome: 'usuarios', tipo: 'BASE TABLE' }]).items[0].tipo,
    ).toBe('table');

    expect(
      mapColumnList([
        { nome: 'id', tipo_dado: 'integer', nullable: 'YES' },
      ]).items[0],
    ).toEqual({
      nome: 'id',
      tipo_dado: 'integer',
      nullable: true,
    });
  });
});
