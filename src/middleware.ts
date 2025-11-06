// src/middleware.ts
import { Request, Response, NextFunction } from 'express';
import { WS402 } from './WS402';
import { WS402MiddlewareOptions } from './types';

/**
 * Express middleware to serve WS402 schema
 */
export function createWS402Middleware(
  ws402: WS402,
  options: WS402MiddlewareOptions = {}
) {
  const {
    resourceIdExtractor = (req: Request) => req.params.resourceId || 'default',
    estimatedDurationExtractor = (req: Request) => 
      parseInt(req.query.duration as string) || 300,
    schemaEndpoint = '/ws402/schema/:resourceId',
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const resourceId = resourceIdExtractor(req);
      const estimatedDuration = estimatedDurationExtractor(req);

      const schema = ws402.generateSchema(resourceId, estimatedDuration);
      
      res.json(schema);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if request should be handled by WS402
 */
export function isWS402Request(req: Request): boolean {
  return req.headers['x-protocol'] === 'ws402' || 
         req.query.protocol === 'ws402';
}
