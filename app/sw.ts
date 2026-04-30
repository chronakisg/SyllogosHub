// Placeholder — full Serwist implementation lands in Step 3.
declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: unknown;
};

// Reference required by Serwist's manifest injection
void self.__SW_MANIFEST;

export {};
