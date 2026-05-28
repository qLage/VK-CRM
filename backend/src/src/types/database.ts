import { PoolClient } from 'pg';
import Database from 'better-sqlite3';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  lastInsertRowid?: number | null;
}

export interface TransactionClient {
  query: <T = any>(text: string, params?: any[]) => Promise<QueryResult<T>>;
}

export type TransactionCallback<T> = (tx: TransactionClient) => Promise<T>;

export type WithoutRLSCallback<T> = (client: PoolClient | Database.Database) => Promise<T>;
