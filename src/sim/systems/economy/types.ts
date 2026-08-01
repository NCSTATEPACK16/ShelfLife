export interface Promotion {
  readonly goodId: string;
  readonly discountFraction: number;
  readonly endsAtTick: number;
}

export type LedgerCategory =
  | 'revenue'
  | 'cogs'
  | 'labor'
  | 'rent'
  | 'utilities'
  | 'marketing'
  | 'shrink'
  | 'spoilage';

export interface LedgerEntry {
  readonly tick: number;
  readonly category: LedgerCategory;
  /** A positive magnitude — revenue is added, every other category is subtracted at
   *  statement time. Never a signed value, so a statement's line always equals the sum
   *  of its category's entries directly. */
  readonly amount: number;
}

export interface DailyStatement {
  readonly day: number;
  readonly revenue: number;
  readonly cogs: number;
  readonly labor: number;
  readonly rent: number;
  readonly utilities: number;
  readonly marketing: number;
  readonly shrink: number;
  readonly spoilage: number;
  readonly ebitda: number;
}
