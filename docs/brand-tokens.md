# BeePlan Brand Tokens

`#F9E547` is BeePlan's single accent yellow. Web exposes it as `--bp-accent`
in `apps/web/src/index.css`; mobile exposes it as `BRAND_YELLOW` in
`apps/mobile/src/theme/colors.ts`. Theme-aware components should consume their
platform's semantic accent token rather than embedding a yellow hex value.
