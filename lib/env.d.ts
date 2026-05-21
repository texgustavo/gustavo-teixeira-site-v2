// env.d.ts — Ambient typing for process.env in the Edge runtime.
//
// We declare a minimal `process` global instead of pulling in @types/node, to
// keep the dev surface clean. Vercel Edge populates `process.env` with the
// project's env vars at request time.

declare const process: {
  env: {
    [key: string]: string | undefined;
    ANTHROPIC_API_KEY?: string;
    UPSTASH_REDIS_REST_URL?: string;
    UPSTASH_REDIS_REST_TOKEN?: string;
    IP_HASH_SECRET?: string;
    AGENT_DAILY_COST_USD?: string;
  };
};
