<!-- LIVE reference — keep in sync with the code. -->

# Design primitives — what the reference build does, and what we took

The Arc Studio app on this machine (a traveller's body-clock app, built in a
sandbox) feels easier to use than ours, and it has strictly less in it. That
is worth understanding rather than copying blind: the gap is not features, it
is **ratio** — how much a screen asks of the eye at once.

This is the study. Each primitive is what the reference does, what it buys,
what it costs, and where we stand.

## The primitives

### 1. One column, centred

The reference is `max-w-md` (448px) and everything lives in it — the header,
the scene, the tab bar. One place for the eye to go.

**Buys:** a screen can be read top to bottom without a decision. That is the
whole difference between a page and a document.
**Costs:** wide media has to break out of the column.

**Ours:** the frame is 1140px and the *reading* content is capped at 720px and
centred (`.reading`). The globe keeps the width; the words do not. Adopted.

### 2. A single accent

`--accent: #1a2340`, one hover state. Nothing else competes for the eye.
Semantic colours (pass/fail) are separate and rare.

**Buys:** "where do I press?" is answerable in a quarter of a second.
**Costs:** our palette is built on "one colour, one meaning" with terracotta as
the accent — ours has a *warmer* accent, which is a difference of taste, not of
structure.

**Ours:** one accent (terracotta), with pass/fail/warn kept separate. Already
true; the restyle that would have broken it was dropped.

### 3. A four-step ink ramp

`ink` → `ink-2` → `muted` → `subtle`. Hierarchy is carried by *colour
weight*, not by size and weight of type.

**Buys:** a page can have levels without anything shouting.
**Costs:** four levels is the limit; a fifth means the ramp is lying.

**Ours:** `clay` / `clay-2` / `clay-3` / `mist` on cream, and `ink`/`paper` on
the dark islands. Same idea, two surfaces. Already true.

### 4. Translucent surfaces over a soft ground

Cards are `rgba(255,255,255,0.72)` with `backdrop-filter: blur(12–32px)
saturate(180%)`, floating over a vertical cream gradient. Depth without
borders.

**Buys:** the page stops being a stack of boxes; the cards feel like surfaces
over a place.
**Costs:** blur is expensive on a phone, and it breaks in print and in
forced-colors mode.

**Ours:** opaque cards with a one-pixel border, over a flat ground. The soft
ground is now in (`body` carries a subtle vertical gradient); the glass cards
are **not** adopted — the cost on a phone and in forced-colors is real, and our
cards have to stay legible over the dark hero.

### 5. Springs, with named levels

`snappy` (420/32), `gentle` (260/24), `lazy` (150/20) — and the same three
everywhere. Transitions have a *vocabulary*, so the app feels like one thing
moving in one way.

**Buys:** motion that means something. A card that springs and a card that
fades read as different events, which is the point.
**Costs:** framer-motion on every transition, and the reduced-motion path has
to be honoured everywhere.

**Ours:** CSS transitions and keyframes for the entrances; framer-motion is
already a dependency (the globe, the scroll) but the feed is CSS. **Adoption
plan:** name three levels and use them for the surfaces we already animate.

### 6. A visible focus ring, in a colour that is not the accent

`outline: 2px solid var(--focus)` — blue, deliberately not the brand colour,
so a focused control is never mistaken for the primary action.

**Buys:** keyboard users see where they are, and the focus never lies about
being the CTA.
**Costs:** none, if the focus colour exists in both themes.

**Ours:** adopted this round — one global `:focus-visible` rule, using
`--m-focus` (falling back to the reference's blue).

### 7. Numbers are always mono

Times, gaps, hours — always in the mono face, never in the body face. A number
in the body face reads as prose; in mono it reads as a measurement.

**Ours:** `font-mono2` on the readouts already; the day pills' gaps are mono
now too. Already true.

### 8. Short labels, always nouns

"Today", "Plan", "Profile". "Your night", "Commitments", "Numbers", "Voice".

**Buys:** the tab bar can be scanned without reading it.
**Costs:** a noun is not a sentence, so the *first* run of a screen has to
carry the sentence instead.

**Ours:** the tab bar is Today / Clock / Plan / Trips; the setup's scenes are
named the same way. Already true.

### 9. The answer is the interface

The first setup scene is a dial you move, not a form you fill. The picture you
already know is the thing you answer with.

**Buys:** one control instead of two, and no unit conversion in the traveller's
head.
**Costs:** the dial needs a keyboard path, or it is a mouse-only answer.

**Ours:** adopted — `SleepDial`, with both handles as focusable sliders.

### 10. A press response

`transform: scale(0.98)` on mouse-down, back on release. The control
acknowledges the finger before anything happens.

**Buys:** the app feels alive under the hand.
**Costs:** none, but it is one more thing to get right on every control.

**Ours:** the buttons have hover and active states, but not a press scale.
**Adoption plan:** the primary actions only (the Done button, the setup's
continue).

### 11. Ambient depth

Big blurred radial gradients behind the content, at 10–13 % opacity. The page
has a *place* without any illustration.

**Ours:** the dawn globe is our place, and it is the one thing the reference
does not have. Keep it; do not add blobs on top.

### 12. Global reduced motion

One media query that flattens every animation and transition.

**Ours:** the globe and the voice honour `prefers-reduced-motion`; the CSS
entrances mostly do not. **Adoption plan:** the same global rule.

## What actually makes it feel easy

Not any one of these. The **ratio**: one accent, one column, one idea per
screen, one control per decision. Ours had four ideas per screen and a
1140px-wide card holding three words of copy — the page read as a document to
be decoded, and the *width* was the loudest part of that.

So the rule we are adopting is narrow and testable: **one screen, one idea,
and the words never spread further than they need to.**

## What we did not take

- **The paywall before the value.** The reference gates the app behind a USDC
  purchase. A traveller who has not felt the clock yet has nothing to weigh
  against a price.
- **The fixed dark setup.** The reference's onboarding is always a night sky.
  Ours is cream, and the Sunlit Horizon is the identity.
- **The `delay` default for a big eastward shift.** The reference's engine
  suggests it; the literature's general answer is to advance pre-flight, and
  ours refuses to make the call rather than making the wrong one.
