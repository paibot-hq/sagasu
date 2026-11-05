export interface Doc {
  url: string;
  title?: string;
  text?: string;
  /** Anything JSON-serializable; returned on hits and passed to `filter`. */
  meta?: unknown;
}

export interface BuilderOptions {
  /** A title token counts as this many body tokens. Default 3. */
  titleWeight?: number;
  /** Characters of body text kept for snippets. 0 disables snippets. Default 3000. */
  excerptLength?: number;
}

export interface SerializedIndex {
  v: 1;
  docs: { u: string; t: string; x?: string; m?: unknown }[];
  lens: number[];
  terms: Record<string, number[]>;
}

export class IndexBuilder {
  constructor(options?: BuilderOptions);
  add(doc: Doc): number;
  toJSON(): SerializedIndex;
}

export interface SearchOptions {
  /** Default 10. */
  limit?: number;
  /** Default 0. */
  offset?: number;
  /** Match the last latin word as a prefix (search-as-you-type). Default true. */
  prefix?: boolean;
  /** Typo tolerance for latin words of 4+ chars. Default true. */
  fuzzy?: boolean;
  /** Also try romaji words as かな. Default true. */
  romaji?: boolean;
  /** Snippet length in chars. 0 disables. Default 120. */
  snippetLength?: number;
  filter?: (meta: any, url: string) => boolean;
}

export interface Hit {
  id: number;
  url: string;
  title: string;
  score: number;
  /** HTML-escaped title with <mark> around matches. */
  titleHTML: string;
  /** HTML-escaped excerpt with <mark> around matches. */
  snippet: string;
  meta?: any;
}

export class SagasuIndex {
  constructor(data: SerializedIndex);
  static from(data: SerializedIndex | string): SagasuIndex;
  static load(url: string | URL, init?: RequestInit): Promise<SagasuIndex>;
  readonly N: number;
  search(query: string, options?: SearchOptions): Hit[] & { total: number };
}

export function createIndex(docs: Doc[], options?: BuilderOptions): SagasuIndex;
export function normalize(text: string): string;
export function fold(text: string, withMap?: boolean): { text: string; source: string; map: number[] | null };
export function romajiToHiragana(romaji: string): string | null;
export function editDistance(a: string, b: string, max?: number): number;
export function highlight(source: string, needles: { text: string; word?: boolean }[], maxLength?: number): string;
