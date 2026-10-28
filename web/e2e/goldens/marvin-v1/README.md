# marvin-v1 goldens

Screenshots of every `/v2` route as Marvin (home, two lanes, devices, lan, health, library, profile), light and dark,
at 1280 and 390 wide. `marvin-v1` changes only for fixes, never for layout, so a diff here needs a reason.

Run from `web/`:

```
npm run build
npm run test:e2e
```

The spec starts a throwaway console (`e2e/serve-console.mjs`) with fixture data and the OpenCode mock, and gets Marvin's
cookie from the console's dev bootstrap (`?dev_as=marvin`). It touches no real data and reads no credentials.

Update after an approved change:

```
npm run test:e2e -- --update-snapshots
```

Review the changed PNGs in the diff before committing them.
