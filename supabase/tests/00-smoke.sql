-- Proves the tier-2 harness reaches a real database and that pgTAP is installed.
-- Every suite wraps itself in begin/rollback so tier 2 never commits.
begin;
select plan(2);

select ok(true, 'the pgTAP runner executes a suite and reads its TAP output');

-- This one cannot pass without an actual connection to a database that has the
-- extension, which is the whole point of a smoke test.
select has_extension('extensions', 'pgtap', 'pgTAP is installed by migration, not ad hoc');

select * from finish();
rollback;
