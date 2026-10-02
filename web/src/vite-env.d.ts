/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the regime API Worker, injected by alchemy.run.ts. */
  readonly VITE_API_URL: string;
}
