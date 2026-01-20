/**
 * @fileoverview Core module exports.
 * @module core
 * @version 1.0.0
 */

export { InitializationCoordinator } from './InitializationCoordinator';
export type { IInitializationCoordinator } from './InitializationCoordinator';
export { ChannelTuningCoordinator } from './channel-tuning';
export type { ChannelTuningCoordinatorDeps } from './channel-tuning';
// Note: InitializationDependencies and InitializationCallbacks are intentionally
// NOT exported. They are internal implementation details used only by Orchestrator.
