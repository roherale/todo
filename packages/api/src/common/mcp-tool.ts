import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';

/** A signed-up caller, as MCP tools see them. */
export interface McpUser {
  id: string;
  timezone: string;
  pageSize: number;
  email: string;
  displayName: string;
}

export interface McpCaller {
  /** Undefined when the token is valid but the person has not signed up yet. */
  user: McpUser | undefined;
}

/**
 * A tool a module offers to MCP clients. `run` calls the same service method as the module's REST
 * endpoint, so rules and errors are the same everywhere; it returns plain data or throws an HttpError.
 */
export interface McpTool<Shape extends ZodRawShape = ZodRawShape> {
  name: string;
  title: string;
  description: string;
  annotations: ToolAnnotations;
  inputSchema: Shape;
  run(args: Record<string, unknown>, user: McpUser): Promise<unknown>;
}
