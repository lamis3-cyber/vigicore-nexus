/**
 * Express 4 does not catch rejections of `async` handlers/middleware: a Prisma or
 * network error becomes an unhandledRejection (request left hanging, and on
 * Node >= 15 a process crash). Importing this module ONCE, before any router is
 * created, makes every layer forward a returned promise's rejection to `next(err)`,
 * i.e. to the global JSON error handler. It complements (does not replace)
 * lib/asyncHandler.ts: wrapped handlers keep working, the double catch is harmless.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Layer = require('express/lib/router/layer');

if (!Layer.prototype.__asyncErrorsPatched) {
  Layer.prototype.handle_request = function handle(req: any, res: any, next: any) {
    const fn = this.handle;
    if (fn.length > 3) return next(); // error-handling middleware: not ours
    try {
      const ret = fn(req, res, next);
      if (ret && typeof ret.catch === 'function') ret.catch(next);
    } catch (err) {
      next(err);
    }
  };
  Layer.prototype.__asyncErrorsPatched = true;
}

export {};
