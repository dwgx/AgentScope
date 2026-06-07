import type { AgentScopeApi } from "../preload/preload";

declare global {
  interface Window {
    agentscope: AgentScopeApi;
  }
}

export {};
