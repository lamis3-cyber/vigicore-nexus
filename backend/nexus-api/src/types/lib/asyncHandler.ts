import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 ne capte pas les rejets d'un handler `async` : sans ce wrapper, une
 * erreur Prisma/réseau devient une « unhandledRejection » (requête suspendue,
 * et crash du process sur Node >= 15). On la transmet au middleware d'erreur
 * global (réponse 500 JSON { success:false }).
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
