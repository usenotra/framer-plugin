# Notra

Framer plugin to import content from [Notra](https://usenotra.com) into CMS collections.

## Development

Run the dev server (uses a proxy to avoid CORS when fetching from the Notra API):

```bash
npm run dev
```

Then [open in Framer](https://www.framer.com/developers/plugins/quick-start#opening-in-framer).

## Production CORS

For the published plugin, the Notra API must allow requests from Framer plugin domains. See [Framer CORS docs](https://www.framer.com/developers/plugins-cors). The API should allow:

- `https://8dd854.plugins.framercdn.com`
- `https://8dd854-[versionId].plugins.framercdn.com`
