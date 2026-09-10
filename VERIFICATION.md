# Fault Code Handoff Implementation - Verification Guide

## Overview
This PR adds a Fault → AI → pro/quote handoff flow to the fault codes page, guiding users to get help after looking up a fault code.

## What Was Implemented

### 1. Hero-level Handoff (Subtle CTA)
**Location:** Below the search input in the hero section
**Content:** "Need help? Ask Boiler Help AI or get a quote"
**Behavior:** Always visible, provides early discovery of help options

### 2. Handoff Card Component
**Location:** Below the fault detail card after a fault is selected
**Content:**
- Title: "Need help fixing this fault?"
- Description: "Get instant AI-powered advice or speak to a Gas Safe registered engineer."
- Three action buttons:
  1. **Ask Boiler Help AI** (primary blue button) → https://myboiler.com/chat/
  2. **Get a Quote** (secondary outlined button) → WhatsApp with prefilled message
  3. **Call: 020 8123 4411** (secondary outlined button) → tel: link

**Behavior:**
- Appears after a fault detail is displayed
- Hidden when user starts a new search
- Preserves existing search functionality
- Does not interfere with Gas Safe disclaimer

## Verification Steps

### Basic Flow Test
1. Navigate to `/fault-codes.html`
2. **Verify:** See hero handoff links below search input
3. Type a fault code (e.g., "Worcester EA")
4. **Verify:** Search results appear as expected
5. Click on a fault code result
6. **Verify:** Fault detail card displays
7. **Verify:** Handoff card appears below fault detail with three buttons
8. Start typing a new search
9. **Verify:** Both detail and handoff cards are hidden

### Link Tests
1. **Hero "Ask Boiler Help AI" link** → Should open https://myboiler.com/chat/
2. **Hero "get a quote" link** → Should open WhatsApp with prefilled message
3. **Handoff "Ask Boiler Help AI" button** → Should open https://myboiler.com/chat/
4. **Handoff "Get a Quote" button** → Should open WhatsApp with message: "I need help with a boiler fault code from BoilerManuals"
5. **Handoff "Call" button** → Should initiate phone call to +442081234411

### Responsive/Mobile Test
1. Resize browser to mobile width (<640px)
2. **Verify:** Hero handoff text wraps gracefully
3. Search and select a fault code
4. **Verify:** Handoff card buttons stack vertically
5. **Verify:** Buttons are full-width and easy to tap

### Design Token Verification
1. **Font:** Inter (system fallback if unavailable)
2. **Primary button background:** #1863dc (--accent)
3. **Primary button hover:** #0f4eb5 (--accent-dark)
4. **Surface background:** #ffffff (--surface)
5. **Border color:** Subtle border (#e8eaed)
6. **Text color:** #1b1b1b for titles, #6b7280 for descriptions
7. **Border radius:** 12px (--radius) for cards, 10px for buttons

### Existing Functionality Tests
1. **Search still works:** Type various fault codes and verify results
2. **Auto-select single result:** Search for a unique code (if available) and verify it auto-displays detail
3. **Gas Safe disclaimer:** Still visible in footer
4. **Brand links:** Fault detail links still work
5. **Hub.myboiler.com links:** Still work as expected

## Expected Behavior Summary

| Scenario | Expected Result |
|----------|----------------|
| Page load | Hero handoff visible, search ready |
| Search query typed | Results appear, no handoff card yet |
| Fault selected | Detail + handoff card both appear |
| New search started | Both cards hide, results update |
| Mobile view | Buttons stack, full-width |
| All links | Open correctly with proper targets |

## Files Changed
- `css/styles.css` - Added handoff card and hero styles
- `fault-codes.html` - Added hero handoff and handoff panel container
- `js/fault-codes.js` - Added showHandoffPanel() function and hide logic

## Browser Compatibility
Should work on all modern browsers (Chrome, Firefox, Safari, Edge) and iOS/Android mobile browsers.

## Notes
- Homepage already has a "Fault Codes" link in the footer navigation, so no additional homepage changes were needed
- Implementation preserves all existing search behavior and UI
- Handoff is intentional but not intrusive - appears only when contextually relevant
