/**
 * @fileoverview Core module exports.
 * @module core
 * @version 1.0.0
 */

export { InitializationCoordinator } from './InitializationCoordinator';
export type { IInitializationCoordinator } from './InitializationCoordinator';
export { ChannelTuningCoordinator } from './channel-tuning';
export type { ChannelTuningCoordinatorDeps } from './channel-tuning';
export { ChannelSetupCoordinator } from './channel-setup';
export type { ChannelSetupCoordinatorDeps } from './channel-setup';
export type {
    ChannelSetupConfig,
    ChannelBuildSummary,
    ChannelBuildProgress,
    ChannelSetupRecord,
    ChannelSetupPreview,
    ChannelSetupReview,
} from './channel-setup';
// Note: InitializationDependencies and InitializationCallbacks are intentionally
// NOT exported. They are internal implementation details used only by Orchestrator.
