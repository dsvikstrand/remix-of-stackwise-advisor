/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RELEASE_SHA?: string;
  readonly VITE_FEATURE_PWA_RUNTIME_V1?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
