# Photo-input fix patch — 2026-10-14

This commit preserves eight selected files from the integrated iRent Guard application. It is a patch archive, not a complete or independently rebuildable snapshot of the integrated application. The rest of the integrated source, local backend, models, private configuration, runtime data, photos and acceptance evidence are not included. Do not deploy this branch as if it were the complete integrated release.

The patch updates photo-input handling, mobile camera/gallery access, customer return submission guards and result presentation. Recognition output that cannot establish a valid damage assessment must not be treated as a successful clean-vehicle decision.

Local validation for this patch: 14 policy checks passed, 8 server checks passed, and the integrated production build succeeded. Build assets: `assets/index-DjUaIwft.js` and `assets/index-CL4usyrU.css`. These checks do not establish model accuracy or successful public deployment; deployment verification is recorded separately.

The existing repository visibility and branch are preserved. This commit contains only the eight source files listed below and this note. It adds no photos, databases, credentials, model weights, private paths or new runtime material.

## Selected source SHA-256

| File | SHA-256 |
| --- | --- |
| `src/lib/clientReturnSubmitGuards.ts` | `201f93e3d0703842ec47498f46f5d1ce4d37b1c707b33ced7b3e9d3468010180` |
| `src/lib/recognitionApi.ts` | `793a1c4f288cac896487f162f205002a3319c1e91d54ba787084288b2d999e94` |
| `src/pages/ClientReturnPage.tsx` | `79cf27730dcb1f637ce69a32ec3daf61ba115240356d8e124be1ee8a443948ac` |
| `src/pages/ClientReturnResultPage.tsx` | `392a2939ecd760cb20ed0181fea092222f282cc662a948fcce0dc589f1946a1c` |
| `src/pages/ReturnReviewPage.tsx` | `6f2b2d2156941cc8b315422eeb8d3ce0053201182a8dfe5919da541ce03523b6` |
| `src/components/RecognitionWorkspace.tsx` | `be3a213987446f4d0dcf41f086f32a31585a873b4041e912dc721feb2f332d3d` |
| `src/styles.css` | `92bb0bd5b26eb090c40b1de9ca5cba8b2ed7c596da74bc0429c45eb6914888ae` |
| `server/demoStore.mjs` | `fe2fa28d60c9e22ded743490532f8fce56dc436b2237e63cdea0a331de221af7` |
