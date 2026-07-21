export class ValidationError extends Error {
  public readonly details: readonly string[];

  public constructor(message: string, details: readonly string[] = []) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

export class NotFoundError extends Error {
  public constructor() {
    super("The requested resource was not found.");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  public constructor(message = "The record changed or conflicts with an existing record.") {
    super(message);
    this.name = "ConflictError";
  }
}

