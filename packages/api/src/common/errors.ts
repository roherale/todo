import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import type { Problem } from '@todo/shared';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(title);
  }
}

function sendProblem(res: Parameters<RequestHandler>[1], status: number, title: string, detail?: string) {
  const body: Problem = {
    type: 'about:blank',
    title,
    status,
    ...(detail === undefined ? {} : { detail }),
    requestId: String(res.locals['requestId']),
  };
  res.status(status).type('application/problem+json').send(body);
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  sendProblem(res, 404, 'Not Found');
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      sendProblem(res, err.status, err.title, err.detail);
      return;
    }
    // Details go to the logs only; the body stays generic.
    logger.error({ err, requestId: res.locals['requestId'] }, 'unhandled error');
    sendProblem(res, 500, 'Internal Server Error');
  };
}
