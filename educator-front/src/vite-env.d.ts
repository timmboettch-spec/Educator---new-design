/// <reference types="vite/client" />

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*/locales/auth/login/*.json' {
  const value: {
    loc: string;
    toast: Record<string, string>;
    account: Record<string, string>;
    login: Record<string, string>;
    signup: Record<string, string>;
    dashboard: Record<string, string>;
    schools: Record<string, string>;
    classes: Record<string, string>;
    students: Record<string, string>;
    educators: Record<string, string>;
    simulations: Record<string, string>;
    reports: Record<string, string>;
    lmsIntegration: Record<string, string>;
    educatorActions: Record<string, string>;
    transferClassModal: Record<string, string>;
    errorState: Record<string, string>;
    [key: string]: string | Record<string, string>;
  };
  export default value;
}
