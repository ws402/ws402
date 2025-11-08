
// src/middlewareHTTP.ts
// Extended WS402 for HTTP resources with WebSocket time tracking

import { Request, Response, NextFunction } from 'express';
import { WS402 } from './WS402';
import { WS402Session } from './types';

/**
 * Middleware for serving HTTP resources with WS402 time tracking
 * 
 * Use case: PDFs, images, videos served via HTTP but tracked via WebSocket
 */
export class WS402HTTPMiddleware {
  private ws402: WS402;
  private activeHTTPSessions: Map<string, {
    sessionId: string;
    resourceId: string;
    startTime: number;
    accessed: boolean;
  }>;

  constructor(ws402: WS402) {
    this.ws402 = ws402;
    this.activeHTTPSessions = new Map();
  }

  /**
   * Middleware to protect HTTP resources
   * Returns 402 if no valid WS402 session exists
   */
  protectHTTPResource = () => {
    return (req: Request, res: Response, next: NextFunction) => {
      const sessionToken = req.query.sessionToken as string;
      const resourceId = req.params.resourceId || req.query.resourceId as string;

      if (!sessionToken) {
        return res.status(402).json({
          error: 'Payment Required',
          message: 'Establish WS402 session first',
          instructions: {
            step1: 'Connect to WebSocket',
            step2: 'Send payment proof',
            step3: 'Receive session token',
            step4: 'Use token to access resource',
          }
        });
      }

      // Verify session exists and is active
      const httpSession = this.activeHTTPSessions.get(sessionToken);
      
      if (!httpSession) {
        return res.status(403).json({
          error: 'Invalid or expired session',
          message: 'Session not found or has ended'
        });
      }

      // Mark resource as accessed
      httpSession.accessed = true;

      // Add session info to request for logging
      (req as any).ws402Session = httpSession;

      // Allow access to resource
      next();
    };
  };

  /**
   * Register a new HTTP session (called after WS402 payment verification)
   */
  registerHTTPSession(sessionId: string, resourceId: string): string {
    const sessionToken = this.generateToken();
    
    this.activeHTTPSessions.set(sessionToken, {
      sessionId,
      resourceId,
      startTime: Date.now(),
      accessed: false,
    });

    return sessionToken;
  }

  /**
   * Remove HTTP session (called when WS402 session ends)
   */
  removeHTTPSession(sessionId: string): void {
    // Find and remove by sessionId
    for (const [token, session] of this.activeHTTPSessions.entries()) {
      if (session.sessionId === sessionId) {
        this.activeHTTPSessions.delete(token);
        break;
      }
    }
  }

  /**
   * Get all active HTTP sessions
   */
  getActiveHTTPSessions(): Array<any> {
    return Array.from(this.activeHTTPSessions.entries()).map(([token, session]) => ({
      token,
      ...session,
      elapsedTime: Date.now() - session.startTime,
    }));
  }

  /**
   * Generate unique session token
   */
  private generateToken(): string {
    return `http_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Helper to create Express route for HTTP resource with WS402 tracking
 */
export function createHTTPResourceRoute(
  ws402: WS402,
  httpMiddleware: WS402HTTPMiddleware,
  resourceGetter: (resourceId: string) => any
) {
  return [
    httpMiddleware.protectHTTPResource(),
    (req: Request, res: Response) => {
      const resourceId = req.params.resourceId || req.query.resourceId as string;
      const session = (req as any).ws402Session;

      console.log(`📄 Serving resource ${resourceId} for session ${session.sessionId}`);

      // Get and serve the resource
      const resource = resourceGetter(resourceId);
      
      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', resource.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${resource.filename}"`);
      res.setHeader('X-WS402-Session', session.sessionId);

      // Send the resource
      if (typeof resource.data === 'string') {
        res.send(resource.data);
      } else if (Buffer.isBuffer(resource.data)) {
        res.send(resource.data);
      } else if (resource.stream) {
        resource.stream.pipe(res);
      } else {
        res.json(resource.data);
      }
    }
  ];
}