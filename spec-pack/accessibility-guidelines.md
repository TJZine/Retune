# Accessibility Guidelines

## Overview

This document outlines accessibility requirements for the Retune webOS application to ensure usability for all users, including those using assistive technologies or LG's webOS accessibility features.

---

## webOS Accessibility Features

LG webOS TVs include several accessibility features that the app should support:

| Feature | Description | App Support Required |
|---------|-------------|---------------------|
| **Screen Reader** | Text-to-speech for UI elements | ARIA labels on all focusable elements |
| **High Contrast Mode** | Enhanced color contrast | CSS media query support |
| **Zoom/Magnification** | UI scaling | Responsive design using relative units |
| **Closed Captions** | Subtitle display | Subtitle track support in player |
| **Audio Description** | Alternative audio tracks | Audio track selection |
| **Remote Button Labels** | On-screen button hints | Include in help/settings |

---

## Required ARIA Implementation

### Focusable Elements

All focusable elements MUST have proper ARIA attributes:

```typescript
interface FocusableElement {
  id: string;
  element: HTMLElement;
  // ARIA properties
  ariaLabel?: string;           // Required if no visible text
  ariaDescribedBy?: string;     // For additional context
  role?: string;                // If not implicit
  //...
}

// On registration
registerFocusable(element: FocusableElement) {
  const el = element.element;
  
  // Ensure focusability
  el.tabIndex = -1;
  
  // Set ARIA attributes
  if (element.ariaLabel) {
    el.setAttribute('aria-label', element.ariaLabel);
  }
  if (element.ariaDescribedBy) {
    el.setAttribute('aria-describedby', element.ariaDescribedBy);
  }
  if (element.role) {
    el.setAttribute('role', element.role);
  }
  
  // Mark as keyboard navigable
  el.setAttribute('data-focusable', 'true');
}
```

### Screen Regions

Mark major UI regions with landmarks:

```html
<!-- Main app structure -->
<header role="banner" aria-label="Application header">
  <!-- Logo, current channel, time -->
</header>

<main role="main" aria-label="Video player and content">
  <section aria-label="Video player">
    <video></video>
  </section>
</main>

<aside role="complementary" aria-label="Program guide">
  <!-- EPG grid -->
</aside>

<div role="dialog" aria-modal="true" aria-label="Settings" hidden>
  <!-- Modal content -->
</div>
```

### EPG Grid

The EPG grid requires comprehensive ARIA for screen reader navigation:

```html
<div role="grid" aria-label="Program guide for next 24 hours">
  <div role="rowgroup">
    <div role="row" aria-label="Channel: Sci-Fi Movies, Channel 1">
      <div role="rowheader">Sci-Fi Movies</div>
      <div role="gridcell" 
           aria-label="Blade Runner, 12:00 PM to 2:15 PM"
           aria-selected="true"
           aria-describedby="blade-runner-desc">
        Blade Runner
      </div>
      <div role="gridcell" 
           aria-label="Total Recall, 2:15 PM to 4:00 PM">
        Total Recall
      </div>
    </div>
  </div>
</div>

<div id="blade-runner-desc" hidden>
  Science fiction film, rated R, 2 hours 15 minutes. 
  NYPD cop hunts dangerous replicants in dystopian future.
</div>
```

### Dynamic Content Announcements

Use live regions for important updates:

```typescript
// Channel change announcement
function announceChannelChange(channel: ChannelConfig, program: ScheduledProgram) {
  const liveRegion = document.getElementById('live-announcements');
  liveRegion.textContent = 
    `Now on channel ${channel.number}, ${channel.name}. ` +
    `Playing: ${program.item.title}. ` +
    `${formatTime(program.remainingMs)} remaining.`;
}
```

```html
<div id="live-announcements" 
     role="status" 
     aria-live="polite" 
     aria-atomic="true"
     class="visually-hidden">
</div>
```

---

## Visual Design Requirements

### Minimum Contrast Ratios

| Element | WCAG AA | WCAG AAA | Retune Target |
|---------|---------|----------|---------------|
| Body text | 4.5:1 | 7:1 | 7:1 |
| Large text (24px+) | 3:1 | 4.5:1 | 4.5:1 |
| UI components | 3:1 | - | 4.5:1 |
| Focus indicators | 3:1 | - | 4.5:1 |

### High Contrast Mode Support

```css
/* Default theme */
:root {
  --text-primary: #ffffff;
  --text-secondary: #b0b0b0;
  --bg-primary: #1a1a1a;
  --focus-ring: #00a0d0;
}

/* High contrast mode (webOS accessibility setting) */
@media (prefers-contrast: more) {
  :root {
    --text-primary: #ffffff;
    --text-secondary: #ffffff;
    --bg-primary: #000000;
    --focus-ring: #ffff00;
  }
  
  /* Increase border visibility */
  .epg-cell {
    border: 2px solid #ffffff;
  }
  
  /* Ensure focus ring is highly visible */
  .focused {
    outline: 4px solid var(--focus-ring);
    outline-offset: 2px;
  }
}
```

### Reduced Motion

```css
/* Respect user preference for reduced motion */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  
  /* Remove focus animations */
  .focused {
    transform: none;
  }
}
```

---

## Focus Visibility

### Focus Ring Requirements

| Requirement | Value |
|-------------|-------|
| Minimum width | 4px |
| Color contrast | 4.5:1 vs adjacent colors |
| Visible from 10ft | Yes |
| Consistent style | Across all screens |

```css
/* Focus ring implementation */
.focusable:focus-visible,
.focused {
  /* Primary focus ring */
  outline: 4px solid var(--focus-ring);
  outline-offset: 2px;
  
  /* Glow effect for visibility */
  box-shadow: 0 0 12px var(--focus-ring);
  
  /* Scale effect (if motion allowed) */
  transform: scale(1.02);
}
```

---

## Subtitle/Caption Requirements

### Caption Settings

Users should be able to customize:

```typescript
interface SubtitleSettings {
  enabled: boolean;
  fontSize: 'small' | 'medium' | 'large' | 'extra-large';
  fontFamily: 'default' | 'sans-serif' | 'serif' | 'monospace';
  fontColor: string;
  backgroundColor: string;
  backgroundOpacity: number;  // 0-100%
  edgeStyle: 'none' | 'drop-shadow' | 'raised' | 'depressed' | 'outline';
}

const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  enabled: true,
  fontSize: 'medium',
  fontFamily: 'default',
  fontColor: '#ffffff',
  backgroundColor: '#000000',
  backgroundOpacity: 75,
  edgeStyle: 'drop-shadow'
};
```

### Caption Positioning

```css
/* Caption safe area */
.subtitle-container {
  position: absolute;
  bottom: 10%;  /* Above safe zone */
  left: 10%;
  right: 10%;
  text-align: center;
}

/* Caption text */
.subtitle-text {
  font-size: var(--subtitle-size);
  color: var(--subtitle-color);
  background: rgba(0, 0, 0, var(--subtitle-bg-opacity));
  padding: 4px 8px;
  display: inline-block;
}
```

---

## Keyboard Navigation Patterns

### Consistent Key Mappings

| Action | Keys | Context |
|--------|------|---------|
| Select/Confirm | OK / Enter | All contexts |
| Cancel/Back | Back | All contexts, closes modal first |
| Navigate | D-pad | All focusable elements |
| Play/Pause | Play/Pause | During playback |
| Open Guide | Guide / Info | During playback |
| Volume | Vol +/- | Handled by webOS |
| Exit App | Home | Handled by webOS |

### Focus Trapping in Modals

When a modal is open, focus MUST be trapped:

1. Focus moves to first focusable element in modal
2. Tab/D-pad cycles within modal only
3. Back button closes modal (not app navigation)
4. Focus returns to trigger element on close

---

## Testing Checklist

### Automated Tests

- [ ] All focusable elements have accessible names
- [ ] Color contrast meets 4.5:1 minimum
- [ ] Focus order is logical
- [ ] Live regions announce changes

### Manual Testing

- [ ] Test with webOS Screen Reader enabled
- [ ] Test with High Contrast Mode
- [ ] Test with Zoom/Magnification
- [ ] Verify all functions work with D-pad only
- [ ] Verify subtitles display correctly
- [ ] Verify audio descriptions work (if available)
- [ ] Verify focus is always visible
- [ ] Verify focus never gets lost

### Recommended Tools

- **axe DevTools**: Browser extension for automated WCAG testing
- **Color Contrast Analyzer**: Verify contrast ratios
- **webOS Accessibility Tester**: Built-in TV accessibility checker
