-- Section 3.1: private bucket, no public URLs. The backend (service role) writes
-- originals here at upload time and mints short-lived signed URLs on read.
-- Path convention: {circle_id}/{receipt_id}/{filename}
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "circle members can read their own receipt images"
on storage.objects for select to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = current_circle_id()::text
);

create policy "circle members can upload their own receipt images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = current_circle_id()::text
);
