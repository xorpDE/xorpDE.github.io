# G25 Balkan Ancestry Calculator

A browser-based ancestry calculator built specifically for Balkan populations. Paste your G25 coordinates, get your ancestry breakdown, and see how you compare to 136 modern and ancient Balkan reference populations.

Works offline. No server. Just one HTML file.

https://xorpde.github.io

## What it does

You paste in your [Global25](https://eurogenes.blogspot.com/) scaled coordinates and the calculator models you as a mixture of four ancestral components:

- **Illyrian** — Iron Age western Balkans (Albania, Dalmatia, Montenegro)
- **Thracian** — Iron Age eastern Balkans (Bulgaria, Thrace)
- **Eastern Roman Anatolian** — Byzantine-era Anatolian/Levantine gene flow
- **Balto-Slavic** — medieval Slavic migration (6th–7th century onward)

It also shows your Euclidean distance to every reference population in the dataset, so you can see which modern and ancient groups you're genetically closest to.

## Pre-Slavic Profile

The calculator has a second mode that strips out the Slavic component from your coordinates. This gives you a "pre-migration" profile — what your ancestry would look like before the Slavic expansions into the Balkans. You can then compare that profile against ancient populations like Iron Age Illyrians, Thracians, Dardanians, ancient Macedonians, etc.

The admixture bar shows the renormalized proportions (0% Slavic), while the distance comparisons use vector-subtracted coordinates to preserve your individual genetic signature.

## PCA Plot

There's an interactive PCA plot built on a sub-PCA of all 136 reference samples. The axes are oriented so that:

- **Right** → Slavic / Steppe
- **Left** → Mediterranean
- **Top** → Paleo-Balkan (Illyrian, Thracian)
- **Bottom** → East Mediterranean / Anatolian

You can zoom, pan, hover for sample names, switch between PC dimensions, and plot your own position. Supports both dark and light mode.

## How the solver works

Under the hood it's a constrained least-squares solver. Because Illyrian and Thracian are genetically close (and would cause unstable results in a direct 4-way solve), the calculator uses a hybrid approach:

1. First solves a stable 3-way model using a combined Paleo_Balkan source + Eastern Roman Anatolian + Balto-Slavic
2. Then splits the Paleo_Balkan portion into Illyrian and Thracian using a fine-grained grid search

This keeps the Illyrian/Thracian split meaningful instead of bouncing wildly between individuals.

The solver itself uses projected gradient descent with simplex projection, multiple starting points, and exhaustive analytical subset enumeration. It's fast enough to run instantly in the browser.

## Reference populations

97 modern population averages including regional breakdowns for Albanian (15 regions), Macedonian (9 regions), Greek (15+ regions), Bulgarian (8 regions), Serbian, Romanian, Montenegrin, Bosnian, Aromanian, Italian, and others.

39 ancient populations from the Bronze Age through the Ottoman period across the Balkans.

## Who this is for

This calculator is designed for people from or descended from the Albania–Kosovo–North Macedonia–Greece–Bulgaria corridor. It'll work for Serbs, Romanians, Montenegrins, and Bosnians too, but the model is really optimized for the central Balkan region.

If your ancestry is mostly outside the Balkans, the results won't be meaningful, you'd need a different set of source populations.

## How to get G25 coordinates

You need your Global25 scaled coordinates to use this calculator. You can get them by sending your autosomal DNA raw data (from 23andMe, AncestryDNA, etc.) to:

- [Davidski / Eurogenes](https://eurogenes.blogspot.com/) — the original G25

## Usage

1. Download `G25_Balkan_Calculator.html` or visit xorpde.github.io
3. Paste your G25 scaled coordinates
4. Hit Calculate

That's it. Everything runs locally in your browser.

## Credits

- G25 coordinates and methodology by Davidski / [Eurogenes](https://eurogenes.blogspot.com/)
- Admixture modeling inspired by [Vahaduo](https://vahaduo.github.io/)
- Ancient DNA samples from published archaeogenetics studies
- MacedonianDNA mods

## License

MIT
