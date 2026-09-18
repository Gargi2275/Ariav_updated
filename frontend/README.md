# Ariav ERP frontend (React + TypeScript)

```bash
npm install
npm run dev
```

Set `frontend/.env` with `VITE_API_BASE_URL=http://localhost:8000`.

## Toasts and API errors

`<ToastContainer />` is mounted once in `App.tsx` (top-right). Do not add another.

- Parser: `parseApiError` / `parseApiErrorDetails` in `src/services/apiError.ts`
- Toasts: `notifySuccess` (~4s) and `notifyApiError` (~6s) in `src/services/notify.ts`

Use this pattern in every new module (Staff, Client, Purchase Orders, …) from day one — never re-implement inline red banners.

```ts
try {
  await api.create(payload);
  notifySuccess(`Entity '${name}' created successfully.`);
  setModalOpen(false);
  await load();
} catch (err) {
  const parsed = notifyApiError(err); // human sentence, never raw JSON
  setFieldErrors(parsed.fields);       // red border; keep the modal open
  if (parsed.fields.includes('category_code')) codeRef.current?.focus();
}
```

409 conflicts on deactivate stay in `ConfirmDialog` (use `parseApiErrorDetails`, do not also toast). List load failures may still show `MasterError` with Retry, plus a toast.
