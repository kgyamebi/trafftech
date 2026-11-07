# Nokware

The operating system for Ghanaian drivers. Status, speed-limit awareness, documents, imported notices and a calculated driver score. TraffiTech, DVLA and the Police stay outside the product: Nokware does not pretend to be connected to them.

```bash
npm install
npm test
npm run dev
```

Open http://localhost:3000. Create an account, or choose **Explore the demo** on the sign-in screen. Demo data is Ama Mensah’s sample and is never written into an account.

`npm run seed` creates a development admin at `dev@nokware.test` / `development-only`, labelled development data.

Copy `.env.example` to `.env.local` for `AUTH_SECRET`, `ADMIN_EMAILS`, and optional model keys. Without a key, Driver Intelligence uses the on-device explainer.
