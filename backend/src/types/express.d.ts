import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        userId?: string;
        email: string;
        role: string;
        company_id: string;
        access_level?: number;
        [key: string]: any;
      };
    }
  }
}

export {};
