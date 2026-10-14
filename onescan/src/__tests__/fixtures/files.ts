// Jest runs in Node, but the app's tsconfig deliberately leaves out Node types
// (so app code can't use Node APIs by accident). Declare just what tests need.
declare const require: (id: string) => { readFileSync(p: string): Uint8Array; join(...p: string[]): string };
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

/** Reads a file relative to the app root (`onescan/`). */
export function readAppFile(rel: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(__dirname, '../../..', rel)));
}
