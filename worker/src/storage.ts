// R2 helpers shared with the web app (relative import: the worker runs with tsx, no `@/` alias).
export { deleteObjects, downloadToFile, uploadFile } from "../../src/lib/r2/client";
export { autoClipKey, reelKey } from "../../src/lib/r2/keys";
