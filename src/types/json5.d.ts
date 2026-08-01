// Vite resolves any import ending in `?raw` to the file's contents as a string,
// regardless of extension — this teaches tsc the same shape so `content/balance/*.json5`
// can be imported as raw text and parsed at load time (see src/sim/systems/pathing/config.ts).
declare module '*.json5?raw' {
  const content: string;
  export default content;
}
