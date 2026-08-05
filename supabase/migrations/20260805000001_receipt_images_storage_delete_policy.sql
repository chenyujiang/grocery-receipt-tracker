-- deleteReceipt() (src/lib/receipts.ts) removes a receipt's stored image
-- alongside its row, but there was no DELETE policy on storage.objects for
-- the "receipts" bucket — only the pre-existing select/insert policies from
-- 20260804000004 — so that storage.remove() call would fail under RLS.
create policy "circle members can delete their own receipt images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = current_circle_id()::text
);
