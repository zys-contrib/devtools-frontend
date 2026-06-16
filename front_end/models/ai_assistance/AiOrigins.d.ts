/**
 * Returns true if the origin is considered opaque and should be blocked from
 * AI assistance to prevent potential data leakage.
 *
 * @param origin The origin string to check.
 * @returns True if the origin is opaque and blocked.
 * @see https://crbug.com/513732588
 */
export declare function isOpaqueOrigin(origin: string): boolean;
/**
 * Extracts the origin from a context URL or identifier.
 * Handles special cases like "detached" nodes, trace identifiers,
 * opaque blob URLs, and isolates local file paths.
 *
 * @param contextURL The context URL or trace/node identifier.
 * @returns The extracted origin string.
 */
export declare function extractContextOrigin(contextURL: string): string;
/**
 * Determines if two origins are equivalent and safe to be used together.
 * Opaque origins are never equivalent to anything, not even themselves.
 */
export declare function areOriginsEquivalent(origin1: string, origin2: string): boolean;
