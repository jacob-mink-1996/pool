import { createMergeWorker, runWorkerProcess } from "./worker-runtime.mjs";

runWorkerProcess(createMergeWorker);
