# The Take

A CHOP Barbershop pay calculator and projection tool, with an inventory workspace for keeping track of supplies.

The pay tools run in the browser. Inventory uses authenticated server routes and separate live and test databases. The repository also includes self-hosted OCR assets for reading images.

## Run locally

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

The development command prepares the OCR assets and starts Vite. A local frontend alone does not configure inventory authentication or storage.

## Check and build

```sh
npm test
npm run test:inventory
npm run build
```

These check the pay calculations, run the inventory tests, and create the production build with OCR and PWA assets.

## Deployment

The project uses a Cloudflare Worker with static assets. Review [wrangler.jsonc](wrangler.jsonc) and the Worker configuration before deployment. Inventory needs authentication, the correct application origin, and distinct `INVENTORY_DB` and `INVENTORY_TEST_DB` bindings. Keep test work separate from live records.

