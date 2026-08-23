# Calgary Parking

Local-first prototype that estimates whether curb space is available from public traffic-camera frames, parking rules, and on-device QVAC inference. The primary target is the Android Expo app; the repository also includes a landing page and desktop fallback.

## Structure

```text
app/                 Next.js landing page and parking UI
mobile/              Expo app and on-device vision pipeline
ba-estaciona-qvac/   QVAC CLI prototype and evaluation code
harness/             Vision-pipeline validation tools
electron/            Desktop shell
ai-harness/          AI-agent context tooling
tests/               Root tests
middleware.ts        Public-route guard
```
