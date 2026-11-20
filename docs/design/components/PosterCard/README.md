# PosterCard

A 2:3 poster with watched, favourite and watchlist toggles, then a meta line and title; the main unit of every carousel.

Pass the real artwork in `image`; without it the card shows the title's initials on `bg-raised`. Toggles sit on a round `scrim` so they read on any art: every toggle keeps its dark backing when on and only fills its icon: watched, favourite and bookmark (on the watchlist) all fill their icon in `accent-text`. Use `detail` for a second line under the title on shows ("45/45 episodes watched"). Default width 132px; carousels use a 12px gap and bleed off the right edge. On a list the card already belongs to (the watchlist, a custom list), set `removable`: an × at top-left replaces the watchlist button.
