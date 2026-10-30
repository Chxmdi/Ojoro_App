-- Step 6 BE-HOST-OPS: host_insights_csv records an analytics event (host_insights_exported), so it
-- can't be STABLE: PostgREST runs stable functions in a read-only transaction (error 25006).
alter function public.host_insights_csv(uuid, integer) volatile;
