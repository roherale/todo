/** A failure that is shown to the person as one clear line, then the CLI exits non-zero. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

export const NOT_LOGGED_IN = 'Not logged in, run `todo login`';

export class NotLoggedInError extends CliError {
  constructor() {
    super(NOT_LOGGED_IN);
  }
}

/** The API refused with a problem+json body. */
export class ApiError extends CliError {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail: string | undefined,
    readonly requestId: string | undefined,
    readonly type: string | undefined,
  ) {
    super(
      `${title}${detail ? `: ${detail}` : ''}${requestId ? ` (requestId: ${requestId})` : ''}`,
    );
  }
}

export class SignupRequiredError extends CliError {
  constructor(readonly signupUrl: string) {
    super(`You need to sign up before using the CLI: ${signupUrl}`);
  }
}
