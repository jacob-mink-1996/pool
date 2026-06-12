import { createCeremonyParticipantWorker, runWorkerProcess } from "./worker-runtime.mjs";

runWorkerProcess(createCeremonyParticipantWorker);
