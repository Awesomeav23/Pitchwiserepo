/**
 * Hash routing, in about forty lines.
 *
 * README listed "routing" as outstanding and noted that picking a router
 * belongs with the URLs it has to carry. Those turned out to be five shapes,
 * all flat, none nested, with no loaders, no guards and no code splitting to
 * arrange. A router would be configuration around a switch statement.
 *
 * Hash rather than history so the app survives being opened from a file or
 * served without a rewrite rule — there is no server serving the client, and a
 * deep link to /course/x would 404 on any static host without configuration.
 */
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'catalog' }
  | { name: 'course'; slug: string }
  | { name: 'lesson'; id: string }
  | { name: 'attempt'; id: string }
  | { name: 'history' }
  | { name: 'practice' }
  | { name: 'tuner' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (path[0]) {
    case 'course':   return path[1] ? { name: 'course', slug: path[1] } : { name: 'catalog' };
    case 'lesson':   return path[1] ? { name: 'lesson', id: path[1] } : { name: 'catalog' };
    case 'attempt':  return path[1] ? { name: 'attempt', id: path[1] } : { name: 'catalog' };
    case 'history':  return { name: 'history' };
    case 'practice': return { name: 'practice' };
    case 'tuner':    return { name: 'tuner' };
    default:         return { name: 'catalog' };
  }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'course':   return `#/course/${route.slug}`;
    case 'lesson':   return `#/lesson/${route.id}`;
    case 'attempt':  return `#/attempt/${route.id}`;
    case 'history':  return '#/history';
    case 'practice': return '#/practice';
    case 'tuner':    return '#/tuner';
    default:         return '#/';
  }
}

export const navigate = (route: Route): void => { location.hash = hrefFor(route); };

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
