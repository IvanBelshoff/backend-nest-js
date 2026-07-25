export type SchemaNodeTipo = 'database' | 'schema';

export type TableNodeTipo = 'table' | 'view';

export interface SchemaNodeItem {
  nome: string;
  tipo: SchemaNodeTipo;
}

export interface TableNodeItem {
  nome: string;
  tipo: TableNodeTipo;
}

export interface ColumnNodeItem {
  nome: string;
  tipo_dado: string;
  nullable?: boolean;
}

export interface SchemaListResult {
  items: SchemaNodeItem[];
}

export interface TableListResult {
  items: TableNodeItem[];
}

export interface ColumnListResult {
  items: ColumnNodeItem[];
}
