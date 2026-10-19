export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message = code,
  ) {
    super(message);
  }
}
export function check(
  condition: unknown,
  status: number,
  code: string,
): asserts condition {
  if (!condition) throw new AppError(status, code);
}
