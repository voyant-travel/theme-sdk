# Changesets

Run `pnpm changeset` for every user-visible package change. Packages are linked
while the `v1alpha1` contract evolves so compatible SDK and Astro releases ship
together.

The repository is in Changesets `alpha` prerelease mode. The unpublished
`0.0.0` baselines and pending minor changeset produce the first
`0.1.0-alpha.0` packages, published under the `alpha` npm dist-tag.
