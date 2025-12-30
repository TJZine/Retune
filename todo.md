# Retune - Post-MVP Todo List

## Future Enhancements

### Telemetry Module (Priority: Medium)
- [ ] Create opt-in telemetry module for error reporting
- [ ] Implement crash reporting (Sentry or similar)
- [ ] Add performance metrics collection
- [ ] Create privacy-compliant data handling
- [ ] Add user-facing opt-in toggle in settings
- [ ] Document in privacy policy for app store submission

### Storybook UI Testing (Priority: Low)
- [ ] Add Storybook configuration
- [ ] Create stories for main UI components
- [ ] Add visual regression testing

### Other Nice-to-Haves
- [ ] Keyboard quick reference overlay (Info button)
- [ ] Rate limiting module (if Plex API issues arise)
- [ ] Favorite channels feature
- [ ] Channel reordering in settings
- [ ] Multiple user profile support

---

## Notes

### Telemetry Implementation Plan
```
Phase 1: Basic crash reporting (Sentry free tier)
- Capture unhandled exceptions
- Capture playback errors
- No user identification

Phase 2: Usage analytics (optional, opt-in)
- Feature usage counts
- Session duration
- Performance metrics
```
