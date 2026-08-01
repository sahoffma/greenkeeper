declare module 'pg' {
  export interface QueryResultRow {
    [column: string]: unknown
  }

  export interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    rows: R[]
    rowCount: number | null
  }

  export interface ClientConfig {
    host?: string
    port?: number
    user?: string
    password?: string
    database?: string
    ssl?: boolean | { rejectUnauthorized?: boolean }
  }

  export class Client {
    constructor(config?: ClientConfig)
    connect(): Promise<void>
    end(): Promise<void>
    query<R extends QueryResultRow = QueryResultRow>(
      queryText: string,
      values?: unknown[],
    ): Promise<QueryResult<R>>
  }
}
