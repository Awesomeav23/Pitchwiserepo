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
 */
export { default } from '../server/dist/app.js';
