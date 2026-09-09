/**
 * Image imports resolve to a URL string through Vite's asset handling.
 *
 * Declared here rather than by referencing `vite/client` wholesale, which would also pull
 * in `ImportMeta.env` and a pile of ambient DOM types that `src/sim` must never see.
 */
declare module '*.png' {
  const url: string;
  export default url;
}

declare module '*.wav' {
  const url: string;
  export default url;
}

/**
 * Just the two `import.meta.env` fields the app actually reads.
 *
 * Declared narrowly rather than pulling in `vite/client`, which would make ambient DOM
 * types visible to every file — including `src/sim`, which must never see them (ADR 0002).
 */
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
