// Services (modular components)
// Export individual service modules here

export interface ServiceBase {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
