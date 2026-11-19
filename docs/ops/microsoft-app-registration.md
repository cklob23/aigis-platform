# Entra app registration for AIGIS

Use this when adding redirect URIs and checking Graph permissions on the AIGIS app registration. Values below match `lib/auth/microsoft.ts`, `app/api/auth/microsoft/*`, and the onboarding consent list.

Live host: https://aigis-platform.onrender.com
Local host: http://localhost:3000

## Platform

Create (or edit) an App registration of type **Web**, not SPA. Sign-in exchanges an authorization code with `MICROSOFT_CLIENT_SECRET` on the server.

## Redirect URIs

In Entra: App registration → Authentication → Platform configurations → Web → Redirect URIs.

Add every URI the code can send as `redirect_uri`. Microsoft rejects a mismatch.

| Purpose | URI |
| --- | --- |
| Sign-in callback (prod) | `https://aigis-platform.onrender.com/api/auth/microsoft/callback` |
| Admin consent callback (prod) | `https://aigis-platform.onrender.com/api/auth/microsoft/consent` |
| Sign-in callback (local) | `http://localhost:3000/api/auth/microsoft/callback` |
| Admin consent callback (local) | `http://localhost:3000/api/auth/microsoft/consent` |

`loginRedirectUri()` returns `MICROSOFT_REDIRECT_URI` when that env var is set, otherwise `{origin}/api/auth/microsoft/callback`.

`consentRedirectUri()` always returns `{origin}/api/auth/microsoft/consent`. Origin is taken from `MICROSOFT_REDIRECT_URI` when set, otherwise from `x-forwarded-proto` / `x-forwarded-host`.

Do not add a trailing slash. Do not register the SPA/localhost Vite ports. Front-channel logout is unused.

## `MICROSOFT_REDIRECT_URI` on Render

Set this on the web service (`srv-dbuhh2hsrm7s73et2mn0`):

```
MICROSOFT_REDIRECT_URI=https://aigis-platform.onrender.com/api/auth/microsoft/callback
```

That is the sign-in callback, not the consent path. Consent is derived from the same origin:

```
https://aigis-platform.onrender.com/api/auth/microsoft/consent
```

Also required on the web service: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`.

For local `next dev`, leave `MICROSOFT_REDIRECT_URI` unset (or set it to the localhost callback) so both login and consent stay on `http://localhost:3000`.

## Graph permissions the app currently requests

Admin consent uses `scope=https://graph.microsoft.com/.default`, so Microsoft grants whatever is **declared on the app registration**, not a list sent in the URL. Keep the registration in sync with the table. Adding a permission in Entra does nothing for a tenant until a Global Administrator re-runs **Grant admin consent**.

### Delegated (sign-in)

Used by `LOGIN_SCOPES` in `lib/auth/microsoft.ts` (`/api/auth/microsoft/login`).

| Permission | Admin consent | Why |
| --- | --- | --- |
| `openid` | No | OpenID Connect |
| `profile` | No | Display name |
| `email` | No | Sign-in email |
| `offline_access` | No | Refresh token |
| `User.Read` | No (signed-in user) | Graph `/me` after login |

### Application (admin consent)

Shown on onboarding step 2 and the Scans page. All of these need **admin consent**.

| Permission | Admin consent | Why |
| --- | --- | --- |
| `User.Read.All` | Yes | Enumerate guests, sponsors |
| `Group.Read.All` | Yes | Groups, Teams, members, owners |
| `Sites.Read.All` | Yes | SharePoint sites linked to groups |
| `Application.Read.All` | Yes | Enterprise app assignments |
| `AuditLog.Read.All` | Yes | `signInActivity` (Entra ID P1/P2). Without it, scans skip last sign-in. |
| `Organization.Read.All` | Yes | Tenant name and verified domains |

### Application, used in code, not on the onboarding list

| Permission | Admin consent | Why |
| --- | --- | --- |
| `Mail.Send` | Yes | Alert and review emails through Graph. If it is missing, mail fails with a message to add it and re-consent. It does not expand discovery scopes. |

### Not requested (do not add without a product decision)

| Permission | Why it is out |
| --- | --- |
| `User.ReadWrite.All` | Guest disable/delete. Remediation is record and confirm on the next scan. |
| `GroupMember.ReadWrite.All` | Remove group memberships. Same as above. |
| `UserAuthenticationMethod.Read.All` | MFA inventory. Recommended later; adding it needs admin re-consent. Do not add it silently. |

## Consent round trip

1. A signed-in administrator opens `/api/auth/microsoft/consent`.
2. Microsoft admin-consent URL uses `redirect_uri={origin}/api/auth/microsoft/consent`.
3. On success the route stamps `tenants.consent_granted_at` and `connection_status=connected`.

If a redirect URI or permission is missing, Microsoft shows an error on their page and AIGIS never sees a grant.

## Checklist

1. Web platform redirect URIs: the four rows in the table (prod callback, prod consent, local callback, local consent).
2. Render env: `MICROSOFT_REDIRECT_URI=https://aigis-platform.onrender.com/api/auth/microsoft/callback`.
3. Application permissions: the six read scopes, plus `Mail.Send` if email delivery is wanted.
4. Grant admin consent for the tenant.
5. Sign in once and complete onboarding step 2.
