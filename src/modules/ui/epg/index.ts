/**
 * @fileoverview EPG UI module public exports
 * @module modules/ui/epg
 * @version 1.0.0
 */

export { EPGComponent } from './EPGComponent';
export { EPGInfoPanel } from './EPGInfoPanel';
export { EPGVirtualizer, positionCell } from './EPGVirtualizer';
export { EPGTimeHeader } from './EPGTimeHeader';
export { EPGChannelList } from './EPGChannelList';
export { EPGErrorBoundary } from './EPGErrorBoundary';

export type { IEPGComponent, IEPGInfoPanel } from './interfaces';
export type {
    EPGConfig,
    EPGState,
    EPGFocusPosition,
    EPGChannelRow,
    EPGProgramCell,
    VirtualizedGridState,
    EPGEventMap,
    ScheduledProgram,
    ScheduleWindow,
    ChannelConfig,
} from './types';

export { EPG_CONSTANTS, EPG_CLASSES, DEFAULT_EPG_CONFIG } from './constants';
export { formatTime, formatTimeRange, formatDuration, rafThrottle } from './utils';
