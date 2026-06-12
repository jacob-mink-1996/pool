import { createExecutionWorker, runWorkerProcess } from "./worker-runtime.mjs";

runWorkerProcess(createExecutionWorker);
