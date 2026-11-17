# Phone sign-in for Next.js with HonkIO Verify

A Next.js (App Router) starter that signs people in with a one-time code texted to their phone. No passwords. Codes are sent and checked with [HonkIO Verify](https://honkio.ca/docs/sms/verify), a Canadian SMS API with data stored in Canada.

- Enter a Canadian mobile number, get a 6-digit code by text, type it in, you're signed in.
- The API key stays on the server: every HonkIO call runs in a server action through the [`@honkio/node`](https://www.npmjs.com/package/@honkio/node) SDK.
- The session is a signed, httpOnly cookie (made with [`jose`](https://github.com/panva/jose)) that lasts 24 hours. No database needed to try it.
- Every error the Verify API returns gets a plain message: wrong code (with tries left), expired code, too many attempts, a code requested too soon, a number that can't get texts.
- Works in test mode out of the box: nothing is sent and nothing is charged.

## Setup

1. Create a HonkIO account at [honkio.ca](https://honkio.ca) and make a **test** API key under [API keys](https://honkio.ca/dashboard/keys). It starts with `mk_test_`.
2. Clone this folder and install:
   ```sh
   npm install
   ```
3. Copy the example settings and fill them in:
   ```sh
   cp .env.example .env.local
   ```
   Set `HONKIO_API_KEY` to your test key, `HONKIO_FROM_NUMBER` to a Canadian number in E.164 (`+1` and ten digits), and `SESSION_SECRET` to 32 or more random characters (`openssl rand -base64 32` makes one).
4. Start it:
   ```sh
   npm run dev
   ```
5. Open http://localhost:3000, enter your mobile number, and type `000000` as the code.

`npm test` runs the unit tests (the SDK is replaced by a fake, so they need no key and no network).

## Test keys and live keys

With a test key (`mk_test_...`):

- No text is sent and nothing is charged. HonkIO still runs its checks (Canadian number, reserved numbers, the one-code-a-minute limit), so you see the same errors you will see live.
- The code is always zeros: `000000` at the default length. The verification returns it as `test_code` (`null` on a live one), and the page shows it.
- `HONKIO_FROM_NUMBER` can be any valid Canadian number, so you can build the whole flow before you buy one.

With a live key (`mk_live_...`):

- Texts are real and each code is charged to your prepaid balance.
- `HONKIO_FROM_NUMBER` must be one of your HonkIO numbers. Buy one in the dashboard under Phone numbers.
- Your account needs its owner phone verified once before it can send live.

Switching is only a change of `HONKIO_API_KEY` and `HONKIO_FROM_NUMBER`.

When `NODE_ENV` is `production` (`npm start`, and every host), a test key's sign-ins are refused, because its code is always `000000`. The visitor sees "not available right now" and your server log says why. Set `ALLOW_TEST_MODE_SIGNIN=true` to allow them for a demo.

## How it works

| File | What it does |
|---|---|
| `app/actions.ts` | The server actions: send a code, check it, start over, sign out. |
| `lib/otp.ts` | Calls `honkio.verify.start` and `honkio.verify.check`, and turns each API error into a message for the visitor. |
| `lib/session.ts` | Signs and reads the two cookies: the code in progress (15 minutes) and the session (24 hours). |
| `lib/rateLimit.ts` | Limits code requests per visitor IP, per phone number from one IP, and per phone number. |
| `lib/clientIp.ts` | Works out the visitor's IP from the headers your host sets. |
| `lib/phone.ts` | Reads what people type ("613 555 0123", "(613) 555-0123") as E.164. |
| `app/sign-in-form.tsx` | The form. It runs in the browser but only calls the server actions. |
| `next.config.ts` | Security headers: no other site may show these pages in a frame. |

The flow:

1. `verify.start({ to, from, appName })` texts the code ("Your Acme verification code is: 123456") and returns a verification id.
2. The id goes into a signed, httpOnly cookie, so the visitor can't swap in someone else's.
3. `verify.check(id, { code })` checks what they typed. On success the app sets the session cookie with the verified phone number.

Verification codes are not commercial messages, so they need no CASL consent and this app records none.

## Settings

| Variable | Required | What it is |
|---|---|---|
| `HONKIO_API_KEY` | Yes | Your HonkIO API key. `mk_test_` to try it, `mk_live_` to send real codes. |
| `HONKIO_FROM_NUMBER` | Yes | The number codes come from, in E.164. With a live key, one of your HonkIO numbers. |
| `SESSION_SECRET` | Yes | Signs both cookies. At least 32 random characters (`openssl rand -base64 32`); one that repeats a few characters is refused. Changing it signs everyone out. |
| `APP_NAME` | No | The name in the text: "Your Acme verification code is: 123456". Default `Acme`. |
| `TRUSTED_PROXY_HOPS` | In production, except on Vercel and Fly.io | How many proxies in front of the app add to `X-Forwarded-For`: `0` for a bare `next start` with nothing in front, `1` behind one proxy (Railway, Render, nginx). Defaults to `1` in development. See [Client IP](#before-you-go-live). |
| `ALLOW_TEST_MODE_SIGNIN` | No | `true` lets a test key sign people in when `NODE_ENV` is `production`. For a demo only. |

## Errors it handles

| API error | What the visitor sees |
|---|---|
| `VERIFICATION_INVALID_CODE` | "That code isn't right. 3 tries left." (from `attempts_remaining`) |
| `VERIFICATION_EXPIRED` | The code has expired; ask for a new one. Codes last 10 minutes. |
| `VERIFICATION_MAX_ATTEMPTS` | Too many wrong codes; ask for a new one. Five wrong codes end a verification. |
| `RATE_LIMITED` | A code was just sent; wait a minute. HonkIO allows one code per number a minute. |
| `NON_CANADIAN_NUMBER`, `NOT_A_MOBILE_NUMBER`, `UNDELIVERABLE_NUMBER` | The number can't get a text here, and why. |
| `OPT_OUT_BLOCKED` | The number texted STOP to you before; text START to get codes again. |
| Sending limits, network errors | Try again in a few minutes. |
| `INSUFFICIENT_BALANCE`, a bad key, and other account problems | A general "not available right now". The details go to your server log, not the visitor. |

The full list is at [honkio.ca/docs/errors](https://honkio.ca/docs/errors).

## What it costs

HonkIO is pay per send in CAD, from a prepaid balance, with no monthly plan. A live code costs the per-segment SMS rate plus a verification upcharge; a code the carrier refuses is refunded. Test mode is free. Current prices are on [honkio.ca/pricing](https://honkio.ca/pricing), and the SDK reads them with `pricing.get()` (`GET /v1/pricing`); `verification_cost_cents` is a typical one-segment code, in cents CAD:

```ts
const { data } = await honkio().pricing.get(); // honkio() is in lib/honkio.ts
console.log(data?.verification_cost_cents);
```

Keep `APP_NAME` short and plain: a long name, or one with accents or emoji, can make the text two segments.

## Deploy

Any host that runs Next.js works (Vercel, Railway, Fly.io, your own server). Set the variables from `.env.example` in the host's settings. Use a different `SESSION_SECRET` in production than in development. Outside Vercel and Fly.io, set `TRUSTED_PROXY_HOPS` too: the first sign-in fails with an error in your server log until you do.

On Vercel: import the folder as a project, add the variables under Settings, Environment Variables, and deploy.

## Before you go live

- **Use a live key:** with a test key every code is `000000`, so anyone can sign in as any number. In production the app refuses test-mode sign-ins and logs why, unless `ALLOW_TEST_MODE_SIGNIN=true`. Set that only for a demo with nothing behind the sign-in.
- **Abuse:** each code costs money, so a public form is a target. HonkIO refuses non-Canadian numbers, sends one code per number a minute, and pauses live codes on its own when traffic looks like SMS pumping (many numbers in one exchange, or codes nobody enters). This app adds three limits on code requests: five per visitor IP and three per phone number from one IP every 15 minutes, and ten per phone number an hour from all IPs. Counting the number with the IP means a stranger asking for codes to your number can't use up your tries; the hourly ceiling caps what someone rotating IPs can send to one number. The limits are kept in memory, so they reset on a restart and each serverless instance has its own. Add a CAPTCHA or a shared rate limit (Redis, your database) before launch.
- **Users:** the session holds only the phone number. Look up or create your user record on `/account` (or in a `proxy.ts`) and put your own user id in the session.
- **Sessions:** a session lasts 24 hours. In production both cookies are named with the `__Host-` prefix, so the browser keeps them only over HTTPS, for the whole site and for this host alone (in development, over `http://localhost`, they use plain names). Both are signed with `SESSION_SECRET`: change it and everyone is signed out, which is also how to end every session at once.
- **Client IP:** a visitor can put anything in `X-Forwarded-For`, so `lib/clientIp.ts` never reads the leftmost entry. On Vercel and Fly.io it reads the header the platform sets. Elsewhere it takes the entry `TRUSTED_PROXY_HOPS` from the right, and in production you must set it: a bare `next start` fills in `X-Forwarded-For` only when the request has none, so with nothing in front of the app the visitor writes every entry. Set `0` for a bare `next start` (no address is trusted), `1` behind one proxy (Railway, Render, nginx), more if more than one proxy adds to the header. When no address can be trusted, the per-IP limit is skipped and the per-number limits still apply.

## Learn more

- [Verify guide](https://honkio.ca/docs/sms/verify)
- [Node SDK](https://honkio.ca/docs/sdk)
- [Error codes](https://honkio.ca/docs/errors)

## License

MIT. See [LICENSE](LICENSE).
