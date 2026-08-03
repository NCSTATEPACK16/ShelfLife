# Parody review log

*Not legal advice.* This is a working log kept per `PLAN.md` §2. If this project ever goes commercial,
have a trademark attorney review the name list.

**Every rival chain is logged here before it is implemented.** The log records the real-world
*archetype* being satirized, what we borrowed (strategy — not ownable), and what we deliberately did
not borrow (name, logo, colors, slogan, trade dress — very much ownable).

## The four-part name test

A name ships only if it passes all four (`PLAN.md` §2.2):

1. **Distinct wordmark** — not a one-character mutation of a real one.
2. **Distinct trade dress** — different color scheme and logo geometry from the archetype.
3. **Punchline present** — the name is a joke, not just a label. Jokes read as commentary.
4. **Category-level, not entity-level** — it could plausibly satirize three real chains, not one.

## Standing rules

- Satirize **business strategy** (pallet pricing, membership lock-in, cult products). Strategy isn't
  ownable.
- Never depict a chain doing something **defamatory** — contamination, crime, labor abuse. "They are
  annoyingly beloved" is safe; alleging misconduct is not.
- **No real product brands on shelves.** SKU brands are invented too.
- **No real logos, fonts, slogans, or trade-dress color pairings — not even as placeholders.**
  Placeholders leak into screenshots and then into search results.
- Ship the disclaimer on the splash screen **and** in the App Store description.

## Disclaimer text (canonical)

> All chains, brands, and products in this game are fictional parodies. Any resemblance to actual
> retailers is satirical.

---

## Log

Status: `planned` → `reviewed` → `implemented`.

| # | Rival | Archetype (category, not entity) | Borrowed (strategy) | Deliberately not borrowed | Name test | Status |
|---|---|---|---|---|---|---|
| 1 | Sav-A-Lott | Dying deep-discounter | Skeleton staffing; one register open | Name, logo, palette, slogan, store layout | 1✓ 2✓ 3✓ 4✓ | implemented |
| 2 | Grocerteria 24 | 24-hour convenience grocer | Always-open; owns the overnight trip | " | 1✓ 2✓ 3✓ 4✓ | planned |
| 3 | BulkHaus Club | Warehouse membership club | Membership lock-in; sample corridor; huge pack sizes | " | 1✓ 2✓ 3✓ 4✓ | planned |
| 4 | Aldente Markt | European hard discounter | Private-label dominance; fast checkout; narrow assortment | " | 1✓ 2✓ 3✓ 4✓ | planned |
| 5 | Winn-Or-Lose | Fading regional legacy chain | Nostalgia loyalty; price-insensitive older shoppers | " | 1✓ 2✓ 3✓ 4✓ | planned |
| 6 | Entire Foods | Premium organic grocer | Prestige positioning; ambiance spend that loses money | " | 1✓ 2✓ 3✓ 4✓ | planned |
| 7 | Hy-Glee | Employee-owned regional chain | Service floor; staff morale as a moat | " | 1✓ 2✓ 3✓ 4✓ | planned |
| 8 | Wagoner's | Destination "cathedral of groceries" | Pulls shoppers from outside the catchment | " | 1✓ 2✓ 3✓ 4✓ | planned |
| 9 | Moo-cee's | Highway megastore with a mascot | Foot traffic + merch + famous restrooms; not really a grocer | " | 1✓ 2✓ 3✓ 4✓ | planned |
| 10 | Trailblazer Jim's | Cult small-format grocer | Identity-driven loyalty; seasonal drops; price-war immunity | " | 1✓ 2✓ 3✓ 4✓ | planned |
| W1 | Sprawl-Mart | Hypermarket world-tier antagonist | Permanent share sink; unbeatable scale | " | 1✓ 2✓ 3✓ 4✓ | planned |
| W2 | PrimeFresh | Delivery platform world-tier antagonist | Delivery undercut on price-sensitive households | " | 1✓ 2✓ 3✓ 4✓ | planned |

### Notes on specific names

- **Moo-cee's** — the archetype (highway megastore, mascot, celebrated restrooms) is close enough to a
  single real chain that test 4 is the weak one. Mitigation: the mascot is a different animal, the
  palette is unrelated, and the satire is aimed at the *category* of destination-retail-as-roadside-
  attraction. Flag for attorney review if this ever goes commercial.
- **Aldente Markt** — deliberately evokes "European hard discounter" generally, and the pun is on
  pasta, not on any wordmark. Reads as a joke first.
- **Entire Foods** — the closest to a wordmark play in the list. It passes test 1 (two changed words,
  not one changed character) and test 3 strongly. Keep the palette and logo geometry far away.

### Pending

- [ ] Original 3-color identity palette per chain, documented in `docs/art-bible.md` — this is part of
      the trade-dress separation, not just an art task.
- [ ] Original logo geometry per chain.
- [ ] Invented SKU brand names (~120 SKUs).
- [ ] Splash-screen disclaimer implemented.
- [ ] App Store description includes the disclaimer.
