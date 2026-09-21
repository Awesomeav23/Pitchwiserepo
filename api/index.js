/**
 * The serverless entry point.
 *
 * Vercel treats each file under /api as a function; this one hands it the same
 * Express application that `server/src/serve.ts` listens with locally. Nothing
 * about the routes, the validation or the database access differs between the
 * two — the only difference is who calls listen().
 *
 * It imports compiled JavaScript rather than TypeScript because the server's
 * tsconfig sets `rewriteRelativeImportExtensions`, so `./pool.ts` in the source
 * becomes `./pool.js` in the output and Node can resolve it with no bundler and
 * no loader.
 *
 * Deploying client and API from one project means they share an origin, so the
 * CORS configuration in the app is only ever exercised in development.
 *
 * The import is dynamic and guarded, which a re-export cannot be. The app
 * reads its configuration at import time and throws on anything missing —
 * deliberately, so a misconfiguration fails loudly rather than on the first
 * request that needs it. Under a serverless runtime that throw happens before
 * any handler exists, so the platform has nothing to report but an opaque
 * FUNCTION_INVOCATION_FAILED, and the actual reason is visible only in a
 * dashboard. Catching it here turns the same failure into a JSON 503 that says
 * which variable is missing, so `curl .../healthz` diagnoses the deployment.
 */

/** Cached across invocations on a warm function, so config is read once. */
let appPromise = null;

/** Connection strings carry credentials and can appear in driver errors. */
const redact = (text) => text.replace(/\/\/[^/@\s]*:[^/@\s]*@/g, '//***:***@');

export default async function handler(req, res) {
  try {
    appPromise ??= import('../server/dist/app.js').then((m) => m.default);
    const app = await appPromise;
    return app(req, res);
  } catch (err) {
    // Not cached: a missing variable added in the dashboard should take effect
    // on the next request rather than needing a redeploy.
    appPromise = null;

    const code = err?.code === 'ERR_MODULE_NOT_FOUND'
      ? 'server_build_missing'
      : 'server_misconfigured';
    const message = redact(err instanceof Error ? err.message : String(err));

    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code, message } }));
  }
}
