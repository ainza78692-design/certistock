-- Archive business data older than one year without hard-deleting it.
-- Run only after a verified backup. This script creates archive tables and moves
-- uploaded file metadata for already archived file payloads.

begin;

create schema if not exists archive;

create table if not exists archive.uploaded_files
(like public.uploaded_files including all);

insert into archive.uploaded_files
select *
from public.uploaded_files
where created_at < now() - interval '1 year'
on conflict (id) do nothing;

-- Keep rows live by default. CertiStock still needs historical TC and stock
-- records for audits; file payloads can be moved to /archive by the retention
-- script while metadata stays queryable.

commit;
