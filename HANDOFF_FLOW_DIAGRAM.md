# Fault Code Handoff Flow - Visual Guide

## User Journey

```
┌─────────────────────────────────────────────────────────┐
│  1. USER LANDS ON FAULT CODES PAGE                      │
│  /fault-codes.html                                       │
│                                                          │
│  ╔══════════════════════════════════════════════════╗   │
│  ║  [Search Input: Brand + code]                    ║   │
│  ║  Need help? Ask Boiler Help AI or get a quote   ║   │
│  ╚══════════════════════════════════════════════════╝   │
│                           ↓                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  2. USER SEARCHES FOR FAULT CODE                        │
│  Types: "Worcester EA" or "F28"                          │
│                                                          │
│  ╔══════════════════════════════════════════════════╗   │
│  ║  Search Results:                                 ║   │
│  ║  • Worcester Bosch - EA                          ║   │
│  ║  • Worcester Bosch - E9                          ║   │
│  ╚══════════════════════════════════════════════════╝   │
│                           ↓                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  3. USER SELECTS A FAULT CODE                           │
│  Clicks on a specific fault                              │
│                                                          │
│  ╔══════════════════════════════════════════════════╗   │
│  ║  Worcester Bosch — EA                            ║   │
│  ║  Meaning: Flame detection fault                  ║   │
│  ║  Possible cause: Gas valve issue                 ║   │
│  ║  Links: Browse Worcester manuals                 ║   │
│  ╚══════════════════════════════════════════════════╝   │
│                           ↓                              │
│  ╔══════════════════════════════════════════════════╗   │
│  ║  HANDOFF CARD APPEARS                            ║   │
│  ║                                                  ║   │
│  ║  Need help fixing this fault?                    ║   │
│  ║  Get instant AI-powered advice or speak to a     ║   │
│  ║  Gas Safe registered engineer.                   ║   │
│  ║                                                  ║   │
│  ║  [Ask Boiler Help AI]  ← Primary Blue Button     ║   │
│  ║  [Get a Quote]         ← Secondary Button        ║   │
│  ║  [WhatsApp]            ← Secondary Button        ║   │
│  ╚══════════════════════════════════════════════════╝   │
│                           ↓                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  4. USER CLICKS ON A HANDOFF OPTION                     │
│                                                          │
│  Option A: Ask Boiler Help AI                            │
│  → Opens https://myboiler.com/chat/                      │
│  → AI chatbot provides instant help                      │
│                                                          │
│  Option B: Get a Quote                                   │
│  → Opens https://hub.myboiler.com/fixed-price-repairs/   │
│  → View fixed-price repair options                       │
│  → Book a Gas Safe engineer                              │
│                                                          │
│  Option C: WhatsApp                                      │
│  → Opens WhatsApp with pre-filled message                │
│  → "I need help with a boiler fault code from           │
│     BoilerManuals"                                       │
│  → Connect to Gas Safe engineer via WhatsApp             │
└─────────────────────────────────────────────────────────┘
```

## Component Breakdown

### Hero Handoff (Always Visible)
```
┌────────────────────────────────────────┐
│ Need help?                             │
│ [Ask Boiler Help AI] or [get a quote] │
└────────────────────────────────────────┘
```
- Positioned below search input
- Subtle text links
- Provides early discovery
- Quote links to fixed-price repairs page

### Handoff Card (Appears After Selection)
```
┌──────────────────────────────────────────┐
│ Need help fixing this fault?             │
│                                          │
│ Get instant AI-powered advice or book    │
│ a fixed-price repair with a Gas Safe     │
│ engineer.                                │
│                                          │
│ ┌──────────────────────────┐             │
│ │ Ask Boiler Help AI       │ ← Primary   │
│ └──────────────────────────┘             │
│                                          │
│ ┌──────────────────────────┐             │
│ │ Get a Quote              │ ← Secondary │
│ └──────────────────────────┘             │
│                                          │
│ ┌──────────────────────────┐             │
│ │ WhatsApp                 │ ← Secondary │
│ └──────────────────────────┘             │
└──────────────────────────────────────────┘
```

## Mobile View (< 640px)

```
┌────────────────────┐
│ Need help fixing   │
│ this fault?        │
│                    │
│ Get instant AI...  │
│                    │
│ ┌────────────────┐ │
│ │ Ask Boiler     │ │
│ │ Help AI        │ │ Full width
│ └────────────────┘ │
│                    │
│ ┌────────────────┐ │
│ │ Get a Quote    │ │ Stacked
│ └────────────────┘ │
│                    │
│ ┌────────────────┐ │
│ │ Call: 020...   │ │ vertically
│ └────────────────┘ │
└────────────────────┘
```

## Design Tokens Used

| Element | Token | Value |
|---------|-------|-------|
| Font | --font | Inter |
| Primary Button BG | --accent | #1863dc |
| Primary Hover | --accent-dark | #0f4eb5 |
| Surface | --surface | #ffffff |
| Background | --bg | #ebeced |
| Text | --text | #1b1b1b |
| Text Muted | --text-muted | #6b7280 |
| Border | --border-subtle | #e8eaed |
| Border Radius | --radius | 12px |

## States & Behavior

| User Action | Component Response |
|-------------|-------------------|
| Page load | Hero handoff visible, handoff card hidden |
| Search query | Results show, handoff card hidden |
| Select fault | Detail + handoff card both appear |
| New search | Both detail and handoff hide |
| Click button | Opens target (chat/WhatsApp/phone) |
| Hover button | Color change + subtle lift effect |

## Integration Points

1. **MyBoiler.com Chat**
   - URL: https://myboiler.com/chat/
   - Target: New tab (rel="noopener")

2. **Fixed-Price Repairs**
   - URL: https://hub.myboiler.com/fixed-price-repairs/
   - Target: New tab (rel="noopener")

3. **WhatsApp Quote**
   - URL: https://wa.me/442081234411
   - Pre-filled message about fault codes
   - Target: New tab (rel="noopener")

## Preserved Elements

✅ Search functionality intact
✅ Fault detail display unchanged
✅ Gas Safe disclaimer visible
✅ Brand links working
✅ Auto-select single result
✅ Existing CSS/JS versions updated
