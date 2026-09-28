export class PublicError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PublicError";
    this.status = status;
  }
}
