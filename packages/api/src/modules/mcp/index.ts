import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import express, { Router } from 'express';
import type { Logger } from 'pino';
import { HttpError } from '../../common/errors.js';
import type { McpTool, McpUser } from '../../common/mcp-tool.js';

const text = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }] });
const failure = (message: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text: message }] });

/** Services throw HttpErrors; a tool reports the same condition as an error result. */
function describeError(err: unknown, logger: Logger): CallToolResult {
  if (err instanceof HttpError) return failure(err.detail ? `${err.title}: ${err.detail}` : err.title);
  logger.error({ err }, 'mcp tool failed');
  return failure('Internal Server Error');
}

export interface McpModuleOptions {
  tools: McpTool[];
  logger: Logger;
  signupUrl: string;
  /** The signed-in caller for a request, set by the authentication middleware. */
  callerOf(res: express.Response): McpUser | undefined;
}

/**
 * A stateless MCP endpoint: every request builds a fresh server and transport, answers, and is
 * discarded. No session id is issued and nothing is kept between requests.
 */
export function createMcpModule({ tools, logger, signupUrl, callerOf }: McpModuleOptions): { router: Router } {
  function buildServer(user: McpUser | undefined): McpServer {
    const server = new McpServer({ name: 'todo', version: '1.0.0' });
    for (const tool of tools) {
      server.registerTool(
        tool.name,
        { title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations },
        async (args: Record<string, unknown>) => {
          if (!user) return failure(`You have not signed up yet. Create your profile at ${signupUrl} and try again.`);
          try {
            return text(JSON.stringify(await tool.run(args, user)));
          } catch (err) {
            return describeError(err, logger);
          }
        },
      );
    }
    return server;
  }

  const router = Router();
  router.post('/', express.json(), (req, res, next) => {
    const server = buildServer(callerOf(res));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    server
      .connect(transport)
      .then(() => transport.handleRequest(req, res, req.body))
      .catch(next);
  });
  // No server-initiated streams and no session to end: only POST is served.
  router.all('/', (_req, res) => {
    res.setHeader('Allow', 'POST').status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  });
  return { router };
}
