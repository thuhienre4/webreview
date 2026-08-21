# Review Hubs backend

The site now runs as a Node.js service and keeps the existing HTML/CSS frontend.

## Routes

- `/healthz` — service health
- `/api/offers` — public offers with coupon codes hidden
- `/api/offers/:id/code` — reveal one active coupon code
- `/api/stores` — public stores
- `/go/:id` — tracked affiliate redirect
- `/admin` — protected store and offer manager

Admin supports dashboard metrics, store CRUD, coupon/deal CRUD, JSON batch import,
visibility controls, featured offers, ordering, and click/reveal counts.

## Local run

Set the environment variables from `.env.example`, then run:

```powershell
$env:ADMIN_PASSWORD='use-a-strong-local-password'
$env:ADMIN_EMAILS='you@example.com'
npm start
```

## Railway

Required variables:

- `NODE_ENV=production`
- `ADMIN_PASSWORD=<strong unique password>`
- `ADMIN_EMAILS=<comma-separated allowed emails>`
- `SITE_URL=<production URL>`

For persistent admin changes, attach a Railway volume at `/data` and set
`DATA_DIR=/data`. Without a volume the API still works, but changes made in
Admin can reset after a redeploy or service restart.
