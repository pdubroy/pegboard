export interface Matcher<R> {
  match: (input: string, startRule?: string) => R;
}

type CstNode = string | CstNode[];
export { CstNode };

export type Result = CstNode | null;

export interface ParserFactory<T> {
  _: (value: string) => T;
  app: (ruleName: string) => T;
  choice: (...exps: T[]) => T;
  lookahead: (exp: T) => T;
  not: (exp: T) => T;
  range: (start: string, end: string) => T;
  rep: (exp: T) => T;
  seq: (...exps: T[]) => T;
  matcher: (rules: { [name: string]: T }) => Matcher<Result>;
}
