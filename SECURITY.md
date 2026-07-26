# Security Policy

## Reporting a Vulnerability

Do **not** open a public GitHub issue for security vulnerabilities.

- Use the **"Report a vulnerability"** button on this repository's Security tab
- Or email: babak@cocode.dk

We will acknowledge within 5 business days and aim to release a fix within 30 days
of confirmation.

## Scope notes

This app has no server, no accounts and no secrets. It makes one anonymous GET to
`api.open-meteo.com` and writes a forecast cache to `localStorage`. The signing
certificate and `.p12` live only on the developer's machine and are git-ignored.

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | ✅ |
| older   | ❌ |
